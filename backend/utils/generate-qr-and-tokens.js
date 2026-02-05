// backend/utils/generate-qr-and-tokens.js
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const OUTPUT_DIR = path.join(__dirname, '../../frontend/public/qr-output');
const TOKENS_FILE = path.join(__dirname, '../data/tokens.json');
const VOTERS_CSV = path.join(__dirname, '../data/voters.csv');

// [TAMBAHAN] Cek dan buat folder data jika belum ada
const dataDir = path.join(__dirname, '../data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('Folder backend/data berhasil dibuat secara otomatis.');
}

// [TAMBAHAN] Fungsi untuk membersihkan folder agar tidak ada QR sisa dari pengujian sebelumnya
const cleanOldQR = () => {
  if (fs.existsSync(OUTPUT_DIR)) {
    const files = fs.readdirSync(OUTPUT_DIR);
    for (const file of files) {
      fs.unlinkSync(path.join(OUTPUT_DIR, file));
    }
    console.log('Membersihkan file QR lama...');
  } else {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

let votersCount = 0;
fs.createReadStream(VOTERS_CSV)
  .pipe(csv())
  .on('data', (row) => {
    if (row.NIK && row.NIK.trim()) votersCount++;
  })
  .on('end', async () => {
    if (votersCount === 0) {
      console.error('Tidak ada pemilih valid di voters.csv!');
      process.exit(1);
    }

    cleanOldQR(); // Panggil fungsi pembersihan

    console.log(`Generate ${votersCount} QR Code + Token...`);
    const tokens = [];

    for (let i = 0; i < votersCount; i++) {
      const token = uuidv4();
      const filename = `TKN_${String(i + 1).padStart(3, '0')}.png`;
      const filepath = path.join(OUTPUT_DIR, filename);

      try {
        // Ganti dengan domain Vercel kamu nanti
        const VERCEL_DOMAIN = 'https://evoting-blockchain-system.vercel.app';

        // Gabungkan Domain + Token sebagai parameter URL
        const qrContent = `${VERCEL_DOMAIN}/index.html?token=${token}`;

        await QRCode.toFile(filepath, qrContent, {
          errorCorrectionLevel: 'M',
          width: 600,
          margin: 4,
          color: { dark: '#000', light: '#FFF' }
        });

        tokens.push({
          index: i + 1,
          qrToken: token,
          filename: filename,
          used: false
        });

        // [PERBAIKAN] Progress bar lebih rapi agar tidak memenuhi console
        process.stdout.write(`\rProgress: ${Math.round(((i + 1) / votersCount) * 100)}% (${i + 1}/${votersCount})`);
      } catch (error) {
        console.error(`\nError generate QR untuk ${filename}: ${error.message}`);
      }
    }

    // [TAMBAHAN] Validasi akhir sebelum tulis file
    if (tokens.length === votersCount) {
      fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2));
      console.log('\n\nSELESAI!');
      console.log(`QR disimpan di: ${OUTPUT_DIR}`);
      console.log(`Token list: ${TOKENS_FILE}`);
    } else {
      console.error('\n\nPERINGATAN: Jumlah token yang digenerate tidak sesuai dengan jumlah pemilih!');
    }
  })
  .on('error', (error) => {
    console.error('Error membaca voters.csv:', error.message);
    process.exit(1);
  });