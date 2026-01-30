const axios = require('axios');

// Konfigurasi endpoint
const BACKEND_URL = 'http://localhost:3001';

async function forceCloseVoting() {
    console.log("--- PROSES PENUTUPAN VOTING (TESTING ONLY) ---");
    
    try {
        // Kita berasumsi Anda punya endpoint tersembunyi atau kita buat di server.js
        const response = await axios.post(`${BACKEND_URL}/admin/force-stop`, {
            secretKey: "TESTING_SECRET_123" // Keamanan sederhana agar tidak sembarang orang akses
        });

        if (response.data.success) {
            console.log("✅ BERHASIL: Voting telah dihentikan secara paksa di Server.");
        } else {
            console.log("❌ GAGAL: " + response.data.error);
        }
    } catch (error) {
        console.error("❌ ERROR: Tidak dapat terhubung ke server. Pastikan server.js menyala.");
        console.error("Pesan:", error.message);
    }
}

forceCloseVoting();