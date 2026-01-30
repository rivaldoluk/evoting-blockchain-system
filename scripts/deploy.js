// scripts/deploy.js
const { ethers, hre } = require("hardhat");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

// Path file data
const VOTED_PATH = path.join(__dirname, "../backend/data/voted.json");
const TOKENS_PATH = path.join(__dirname, "../backend/data/tokens.json");

async function main() {
  console.log("\n🔍 Melakukan pengecekan integritas data lokal...");

  // 1. Cek voted.json
  if (fs.existsSync(VOTED_PATH)) {
    const votedData = JSON.parse(fs.readFileSync(VOTED_PATH, "utf8"));
    // Cek apakah ada NIK yang sudah bernilai true
    const hasVotedEntries = Object.values(votedData).some(v => v === true || v.voted === true);
    
    if (hasVotedEntries) {
      console.error("\n❌ PERINGATAN: File voted.json masih menyimpan data pemilih yang sudah memilih!");
      console.error("Silakan jalankan 'node backend/utils/generate-merkle-root.js' untuk mereset data.");
      process.exit(1); // Hentikan deploy agar tidak terjadi ketidaksinkronan
    }
  }

  // 2. Cek tokens.json
  if (fs.existsSync(TOKENS_PATH)) {
    const tokensData = JSON.parse(fs.readFileSync(TOKENS_PATH, "utf8"));
    const hasUsedTokens = tokensData.some(t => t.used === true);

    if (hasUsedTokens) {
      console.error("\n❌ PERINGATAN: File tokens.json masih menyimpan token yang sudah terpakai!");
      console.error("Silakan jalankan 'node backend/utils/generate-qr-and-tokens.js' untuk mereset token.");
      process.exit(1); // Hentikan deploy
    }
  }

  console.log("✅ Data lokal bersih. Melanjutkan ke proses deploy...\n");
  
  // Ambil signer dengan safety check
  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    throw new Error("Tidak ada signer! Cek .env: PRIVATE_KEY harus ada dan valid (pindah dari PRIVATE_KEY_DEPLOYER kalau perlu).");
  }
  const deployer = signers[0];

  console.log("Deploying contracts with account:", deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");

  // Cek balance cukup untuk deploy
  if (balance < ethers.parseEther("0.01")) {
    throw new Error("Balance terlalu rendah! Butuh minimal 0.01 Sepolia ETH untuk deploy.");
  }

  // Ambil trusted forwarder dari .env
  const trustedForwarder = process.env.RELAYER_ADDRESS?.trim();
  if (!trustedForwarder || trustedForwarder === "") {
    throw new Error("RELAYER_ADDRESS tidak ditemukan di .env!");
  }

  // Deploy contract
  const PilkadesVoting = await ethers.getContractFactory("PilkadesVoting");
  const pilkadesVoting = await PilkadesVoting.deploy(trustedForwarder);
  await pilkadesVoting.waitForDeployment();

  const contractAddress = await pilkadesVoting.getAddress();
  console.log("PilkadesVoting deployed to:", contractAddress);

  // Set Merkle Root
  const merkleRootPath = path.join(__dirname, "../backend/data/merkleRoot.txt");
  if (!fs.existsSync(merkleRootPath)) {
    throw new Error("merkleRoot.txt tidak ditemukan! Jalankan generate-merkle-root.js dulu.");
  }
  const merkleRoot = fs.readFileSync(merkleRootPath, "utf8").trim();
  if (!ethers.isHexString(merkleRoot, 32)) {
    throw new Error("Merkle Root tidak valid (harus 0x + 64 hex chars).");
  }

  console.log("Setting Merkle Root:", merkleRoot);
  const setRootTx = await pilkadesVoting.setMerkleRoot(merkleRoot);
  await setRootTx.wait();
  console.log("Merkle Root berhasil di-set.");

  // Baca kandidat dari backend/data/kandidat.json
  const kandidatPath = path.join(__dirname, "../backend/data/kandidat.json");
  if (!fs.existsSync(kandidatPath)) {
    throw new Error("kandidat.json tidak ditemukan di backend/data/! Buat file dulu.");
  }

  const kandidatData = JSON.parse(fs.readFileSync(kandidatPath, "utf8"));
  if (!Array.isArray(kandidatData) || kandidatData.length === 0) {
    throw new Error("kandidat.json kosong atau bukan array!");
  }

  console.log(`Menambahkan ${kandidatData.length} kandidat dari kandidat.json...`);
  for (const kandidat of kandidatData) {
    const name = kandidat.nama;
    if (!name || typeof name !== "string") {
      console.warn(`Skip kandidat invalid: ${JSON.stringify(kandidat)}`);
      continue;
    }
    const tx = await pilkadesVoting.addCandidate(name);
    await tx.wait();
    console.log(`Kandidat ditambahkan: ${name}`);
  }

  // // Mulai voting
  // const votingHours = parseInt(process.env.VOTING_DURATION_HOURS || "6", 10);
  // const durationSeconds = votingHours * 3600;
  // console.log(`Memulai voting selama ${votingHours} jam (${durationSeconds} detik)...`);

  // const startTx = await pilkadesVoting.startVoting(durationSeconds);
  // await startTx.wait();
  // console.log("Voting dimulai!");

  // Update .env dengan CONTRACT_ADDRESS
  const envPath = path.join(__dirname, "../.env");
  let envContent = fs.readFileSync(envPath, "utf8");
  const newLine = `CONTRACT_ADDRESS=${contractAddress}`;

  if (envContent.includes("CONTRACT_ADDRESS=")) {
    envContent = envContent.replace(/CONTRACT_ADDRESS=.*/, newLine);
  } else {
    envContent += `\n${newLine}`;
  }
  fs.writeFileSync(envPath, envContent.trim() + "\n");
  console.log("CONTRACT_ADDRESS di-update di .env");

  console.log("\n🎉 DEPLOY SELESAI! 🎉");
  console.log(`Contract: ${contractAddress}`);
  console.log(`Explorer: https://sepolia.etherscan.io/address/${contractAddress}`);
}

main().catch((error) => {
  console.error("Deploy gagal:", error);
  process.exit(1);
});