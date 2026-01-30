// backend/utils/generate-merkle-root.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { MerkleTree } = require('merkletreejs');
const keccak256 = require('keccak256');

const leaves = [];
// [TAMBAHAN] Gunakan Set untuk mendeteksi NIK ganda agar tidak ada duplikasi leaf
const seenNiks = new Set(); 

const inputPath = path.join(__dirname, '../data/voters.csv');
const rootPath = path.join(__dirname, '../data/merkleRoot.txt');
const proofsPath = path.join(__dirname, '../data/proofs.json');
const votedPath = path.join(__dirname, '../data/voted.json');

console.log('Sedang memproses data pemilih...');

fs.createReadStream(inputPath)
  .pipe(csv())
  .on('data', (row) => {
    const cleanNik = row.NIK ? row.NIK.trim() : null;

    if (!cleanNik) {
      console.warn('Baris CSV invalid (NIK kosong), dilewati.');
      return;
    }

    // [PERBAIKAN] Cek duplikasi NIK sebelum dimasukkan ke pohon Merkle
    if (seenNiks.has(cleanNik)) {
      console.warn(`NIK Duplikat ditemukan: ${cleanNik}, dilewati.`);
      return;
    }
    seenNiks.add(cleanNik);

    // [PERBAIKAN] Pastikan input ke keccak256 adalah string murni 
    // agar sinkron dengan abi.encodePacked di Solidity nanti
    const nikHash = keccak256(cleanNik); 
    leaves.push(nikHash);
  })
  .on('end', () => {
    if (leaves.length === 0) {
      console.error('Tidak ada data pemilih valid di voters.csv!');
      process.exit(1);
    }

    // [TAMBAHAN] Tambahkan log jumlah data unik
    console.log(`\nBerhasil memuat ${leaves.length} pemilih unik.\n`);
    
    // Gunakan sortPairs: true agar kompatibel dengan library OpenZeppelin
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const root = tree.getHexRoot();
    
    fs.writeFileSync(rootPath, root);
    console.log('Merkle Root:', root);
    
    // [PERBAIKAN] Simpan hash dalam format String Hex agar mudah dibaca di JSON
    const proofs = leaves.map((leaf, index) => {
      const leafHex = '0x' + leaf.toString('hex');
      return {
        index: index + 1,
        nikHash: leafHex,
        proof: tree.getHexProof(leaf)
      };
    });
    
    fs.writeFileSync(proofsPath, JSON.stringify(proofs, null, 2));
    
    // [PERBAIKAN] Struktur voted.json diperbaiki agar lebih ringan
    const voted = {};
    proofs.forEach(item => {
      voted[item.nikHash] = false;
    });
    fs.writeFileSync(votedPath, JSON.stringify(voted, null, 2));
    
    console.log('\nSelesai! Semua file berhasil disimpan.');
    console.log('Tip: Gunakan Merkle Root ini untuk deploy Smart Contract di Sepolia.');
  })
  .on('error', (error) => {
    console.error('Error membaca voters.csv:', error.message);
    process.exit(1);
  });