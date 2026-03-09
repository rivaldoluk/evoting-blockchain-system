// backend/server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const keccak256 = require('keccak256');
const cors = require('cors');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app = express();
const port = 3001;

// Middleware CORS - IZINKAN frontend di port 3000
app.use(cors({
  origin: '*', // izinkan hanya dari frontend di 3000
  methods: ['GET', 'POST'], // method yang diizinkan
  allowedHeaders: ['Content-Type', 'ngrok-skip-browser-warning'],
  credentials: false
}));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../frontend/public')));
// Tambahkan ini di bawah middleware lainnya (setelah app.use(express.json()))
app.use('/img', express.static(path.join(__dirname, 'img')));

// Path file data
const PROOFS_PATH = path.join(__dirname, 'data/proofs.json');
const VOTED_PATH = path.join(__dirname, 'data/voted.json');
const TOKENS_PATH = path.join(__dirname, 'data/tokens.json'); // kalau pakai mapping token
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const RELAYER_PRIVATE_KEY = process.env.PRIVATE_KEY_RELAYER;
const SEPOLIA_RPC = process.env.ALCHEMY_KEY
  ? `https://eth-sepolia.g.alchemy.com/v2/${process.env.ALCHEMY_KEY}`
  : "https://rpc.sepolia.org";

// ABI minimal untuk contract PilkadesVoting (copy dari artifacts setelah compile)
const ABI = [
  "function vote(bytes32 _nikHash, bytes32[] calldata _proof, uint256 _candidateId) external",
  "function startVoting(uint256 _duration) external",
  "function hasVoted(bytes32) view returns (bool)",
  "function isVotingActive() view returns (bool)",
  "function getCandidateCount() view returns (uint256)",
  "function candidates(uint256) view returns (uint256 id, string name, uint256 voteCount)",
  "function getEndTime() view returns (uint256)"
];

// Setup provider & wallet relayer
const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
const relayerWallet = new ethers.Wallet(RELAYER_PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, relayerWallet);

// Load data (di-load sekali saat start server)
let proofs = {};
let voted = {};
let tokens = {}; // kalau pakai mapping token → hashNIK
let activeLocks = new Set();
let voteQueue = [];
let isProcessingQueue = false;

try {
  proofs = JSON.parse(fs.readFileSync(PROOFS_PATH, 'utf8'));
  voted = JSON.parse(fs.readFileSync(VOTED_PATH, 'utf8'));
  // Load tokens.json sebagai array (sesuai generate script Anda)
  if (fs.existsSync(TOKENS_PATH)) {
    tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf8'));
    console.log(`Berhasil load ${tokens.length} token dari tokens.json`);
  } else {
    console.log('File tokens.json tidak ditemukan, validasi token tidak aktif.');
  }

  console.log('Data proofs, voted, dan tokens berhasil di-load.');
} catch (err) {
  console.error('Error load data:', err.message);
}

app.get('/contract-info', (req, res) => {
    res.json({
        address: CONTRACT_ADDRESS,
        // Sesuaikan networknya, misal: 'sepolia' atau 'mainnet'
        explorerUrl: `https://sepolia.etherscan.io/address/${CONTRACT_ADDRESS}` 
    });
});

// Endpoint: Halaman utama (serve frontend)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// Endpoint: Verifikasi token QR (tiket masuk)
app.post('/verify-token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token QR tidak boleh kosong' });

  // Jika tokens array kosong (tidak pakai token validasi), langsung OK
  if (tokens.length === 0) {
    return res.json({ success: true, message: 'Token QR valid, silakan input NIK' });
  }

  // Cek di array tokens (sesuai struktur generate Anda)
  const tokenData = tokens.find(t => t.qrToken === token);

  if (!tokenData) {
    return res.status(403).json({ error: 'Token QR tidak terdaftar' });
  }

  if (tokenData.used === true) {
    return res.status(403).json({ error: 'Token ini sudah digunakan' });
  }

  // Jika lolos → success
  return res.json({ success: true, message: 'Token valid, silakan input NIK' });
});

// Endpoint: Verifikasi NIK (cek apakah NIK terdaftar di proofs.json)
app.post('/verify-nik', (req, res) => {
  const { nik } = req.body;
  if (!nik || nik.trim().length !== 16 || !/^\d{16}$/.test(nik)) {
    return res.status(400).json({ success: false, error: 'NIK harus tepat 16 digit angka' });
  }

  const cleanNik = nik.trim();
  const nikHash = '0x' + keccak256(cleanNik).toString('hex');

  const proofData = proofs.find(p => p.nikHash === nikHash);
  if (!proofData) {
    return res.status(403).json({ success: false, error: 'NIK tidak terdaftar sebagai pemilih' });
  }

  // --- PERBAIKAN DI SINI ---
  // Cek apakah nikHash ada di object voted DAN property voted-nya bernilai true
  if (voted[nikHash] && (voted[nikHash] === true || voted[nikHash].voted === true)) {
    return res.status(403).json({ success: false, error: 'NIK ini sudah memberikan suara' });
  }

  res.json({ success: true, message: 'NIK valid' });
});

// Endpoint untuk cek status voting langsung dari blockchain
app.get('/voting-status', async (req, res) => {
  try {
    const isActive = await contract.isVotingActive();
    const endTime = await contract.getEndTime();
    const currentTime = Math.floor(Date.now() / 1000);
    const endTimeNumber = Number(endTime);

    let status = "ended";
    let targetTime = 0;

    // Jika contract bilang active DAN waktu sekarang belum melewati endTime
    if (isActive && currentTime < endTimeNumber) {
      status = "active";
      targetTime = endTimeNumber * 1000; // Konversi ke milidetik untuk JS
    } else if (isActive && currentTime >= endTimeNumber) {
      // Waktu habis tapi di contract masih status active (otomatis anggap ended)
      status = "ended";
    } else if (!isActive && endTimeNumber > 0) {
      // Sudah pernah mulai tapi sudah ditutup manual
      status = "ended";
    } else {
      // Kasus deploy baru tapi belum panggil startVoting (Upcoming)
      status = "upcoming";
    }

    res.json({
      success: true,
      status,
      targetTime,
      currentTime: Date.now()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint: Vote (verifikasi NIK + proof + kirim tx ke contract)
app.post('/vote', async (req, res) => {
    const { nik, candidateId, token } = req.body;

    if (!nik || !candidateId) return res.status(400).json({ error: 'Data tidak lengkap' });

    const cleanNik = nik.trim();
    const nikHash = '0x' + keccak256(cleanNik).toString('hex');

    // Cek Double Voting di Memori (Database JSON)
    if (voted[nikHash] && (voted[nikHash] === true || voted[nikHash].voted === true)) {
        return res.status(403).json({ error: 'NIK ini sudah memberikan suara' });
    }

    // Cek apakah sedang ada dalam antrean aktif
    if (activeLocks.has(nikHash)) {
        return res.status(429).json({ error: 'NIK ini sedang dalam proses antrean.' });
    }

    // Ambil data proof
    const proofData = proofs.find(p => p.nikHash === nikHash);
    if (!proofData) return res.status(403).json({ error: 'NIK tidak terdaftar' });

    // MASUKKAN KE ANTREAN
    activeLocks.add(nikHash);
    
    // Kirim response "Pending" ke UI agar user tidak menunggu lama
    // Kita berikan janji bahwa suara sedang diproses
    res.json({
        success: true,
        message: 'Suara Anda telah masuk antrean blockchain. Mohon tunggu konfirmasi.',
        nikHash: nikHash
    });

    // Tambahkan ke array antrean untuk diproses satu per satu
    voteQueue.push({ nikHash, proofData, candidateId, token });
    
    // Jalankan pemroses antrean (jika belum jalan)
    processVoteQueue();
});

async function processVoteQueue() {
    if (isProcessingQueue || voteQueue.length === 0) return;

    isProcessingQueue = true;
    const currentVote = voteQueue[0]; // Ambil antrean pertama
    const { nikHash, proofData, candidateId, token } = currentVote;

    try {
        console.log(`[Queue] Memproses vote untuk: ${nikHash}. Sisa antrean: ${voteQueue.length - 1}`);

        const feeData = await provider.getFeeData();
        
        // Kirim transaksi dan TUNGGU (await) sampai terkirim
        // Ethers akan otomatis mengambil Nonce terbaru yang valid
        const tx = await contract.vote(nikHash, proofData.proof, candidateId, {
            gasLimit: 350000,
            maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas * 2n),
            maxFeePerGas: (feeData.maxFeePerGas * 2n)
        });

        console.log(`[Queue] Tx Terkirim: ${tx.hash}. Menunggu konfirmasi blok...`);

        // TUNGGU sampai transaksi benar-benar masuk blok (Confirmed)
        // Ini kunci agar transaksi berikutnya mendapatkan Nonce + 1
        const receipt = await tx.wait();
        
        console.log(`✅ [Queue] Berhasil! NIK: ${nikHash} | Block: ${receipt.blockNumber}`);

        // UPDATE DATABASE
        if (token) {
            const tokenIdx = tokens.findIndex(t => t.qrToken === token);
            if (tokenIdx !== -1) {
                tokens[tokenIdx].used = true;
                fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens, null, 2));
            }
        }

        voted[nikHash] = {
            voted: true,
            txHash: tx.hash,
            timestamp: Date.now()
        };
        fs.writeFileSync(VOTED_PATH, JSON.stringify(voted, null, 2));

        // Update dashboard via SSE
        await sendUpdateToAll();

    } catch (err) {
        console.error(`❌ [Queue] Gagal memproses NIK ${nikHash}:`, err.message);
        // Jika gagal karena gas atau network, NIK bisa dilepas agar bisa coba lagi
    } finally {
        activeLocks.delete(nikHash);
        voteQueue.shift(); // Hapus yang sudah diproses dari antrean
        isProcessingQueue = false;
        
        // Jalankan lagi untuk antrean berikutnya jika ada
        if (voteQueue.length > 0) {
            processVoteQueue();
        }
    }
}

// Path ke file JSON kandidat baru
const KANDIDAT_JSON_PATH = path.join(__dirname, 'data/kandidat.json');

// Fungsi Helper: Mengambil data gabungan Blockchain + JSON
async function getResultsData() {
  try {
    let detailKandidat = [];
    if (fs.existsSync(KANDIDAT_JSON_PATH)) {
      detailKandidat = JSON.parse(fs.readFileSync(KANDIDAT_JSON_PATH, 'utf8'));
    }

    const candidateCount = await contract.getCandidateCount();
    const promises = [];

    for (let i = 0; i < Number(candidateCount); i++) {
      promises.push(contract.candidates(i));
    }

    const blockchainResults = await Promise.all(promises);

    return blockchainResults.map((blockchainData, i) => {
      const idStr = blockchainData.id.toString();
      const detail = detailKandidat.find(k => k.id.toString() === idStr);
      return {
        id: idStr,
        noUrut: detail ? detail.noUrut : (i + 1).toString().padStart(2, '0'),
        nama: blockchainData.name,
        tagline: detail ? detail.tagline : "",
        votes: Number(blockchainData.voteCount),
        foto: detail ? detail.foto : "img/default.png",
        warna: detail ? detail.warna : "#0d6efd",
        visi: detail ? detail.visi : "Visi belum tersedia",
        misi: detail ? detail.misi : [],
      };
    });
  } catch (err) {
    console.error('Error getResultsData:', err.message);
    return [];
  }
}

// Endpoint: Lihat hasil voting (Load pertama kali)
app.get('/results', async (req, res) => {
  const results = await getResultsData();
  res.json(results);
});

// List client aktif untuk SSE
let clients = [];

// Endpoint: Konfigurasi Admin & Daftar Pemilih Terdaftar
app.get('/admin/config', (req, res) => {
  try {
    const currentProofs = JSON.parse(fs.readFileSync(PROOFS_PATH, 'utf8'));
    const currentVoted = JSON.parse(fs.readFileSync(VOTED_PATH, 'utf8'));

    res.json({
      contractAddress: process.env.CONTRACT_ADDRESS || "",
      abi: ABI,
      authorizedAdmin: process.env.DEPLOYER_ADDRESS || "",
      totalDPT: currentProofs.length,
      votersList: currentProofs.map(p => {
        const voteData = currentVoted[p.nikHash];
        return {
          nikHash: p.nikHash,
          voted: !!voteData, // true jika ada datanya
          // Tambahkan metadata di bawah ini:
          txHash: voteData?.txHash || null,
          timestamp: voteData?.timestamp || null
        };
      })
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat data" });
  }
});

app.get('/results-stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // KIRIM DATA AWAL SEGERA SAAT CLIENT CONNECT
  // Agar Dashboard tidak kosong saat baru dibuka
  const initialResults = await getResultsData();
  res.write(`data: ${JSON.stringify(initialResults)}\n\n`);

  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(client => client !== res);
    res.end();
  });
});

// Tambahkan di backend/server.js
app.get('/check-vote-status/:nik', (req, res) => {
    const cleanNik = req.params.nik.trim();
    const nikHash = '0x' + keccak256(cleanNik).toString('hex');

    // Cek di objek 'voted' yang sudah Anda buat di server.js
    const voteData = voted[nikHash];

    if (voteData && voteData.txHash) {
        return res.json({
            success: true,
            status: 'confirmed',
            txHash: voteData.txHash,
            nikHash: nikHash
        });
    }

    // Jika belum ada txHash, berarti masih di queue
    res.json({ success: true, status: 'pending' });
});

let cachedResults = null;

app.post('/admin/start-voting', async (req, res) => {
  try {
    const { hours } = req.body;
    const durationSeconds = parseInt(hours) * 3600;

    console.log(`Membuka voting untuk durasi ${hours} jam...`);
    const tx = await contract.startVoting(durationSeconds);
    await tx.wait();

    res.json({ success: true, message: "Voting resmi dimulai!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Gagal membuka voting: " + err.message });
  }
});

async function sendUpdateToAll() {
  const results = await getResultsData();
  cachedResults = results; // Simpan di cache
  const data = `data: ${JSON.stringify(results)}\n\n`;
  clients.forEach(client => client.write(data));
}

// Start server
app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
  console.log('Buka browser: http://localhost:3000');
});