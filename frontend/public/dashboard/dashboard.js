const BACKEND_URL = 'https://146c2c53074d.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let countdownInterval = null;

function getFullImageUrl(path) {
    if (!path) return '/img/default.png';
    if (path.startsWith('http')) return path;
    const fileName = path.split('/').pop();
    return `/img/${fileName}`;
}

// --- 1. Security & Access Control ---
(function () {
    const nik = sessionStorage.getItem('voterNIK');
    const hasVoted = localStorage.getItem('hasVoted');

    if (!nik) {
        window.location.replace('../index.html');
        return;
    }

    if (hasVoted !== 'true') {
        window.location.replace('../user/user.html');
        return;
    }

    window.history.pushState(null, null, window.location.href);
    window.onpopstate = function () {
        window.history.pushState(null, null, window.location.href);
    };
})();

// --- 2. Initializing Page & Event Stream ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    fetchResults(); // Ambil data awal saat pertama kali buka
    setupRealtimeUpdate();
    checkVotingStatus();
});

// --- 3. Setup Real-time Update (Native SSE) ---
function setupRealtimeUpdate() {
    // Membuat koneksi ke endpoint stream di backend
    const eventSource = new EventSource(`${BACKEND_URL}/results-stream`);

    eventSource.onmessage = (event) => {
        try {
            const updatedData = JSON.parse(event.data);
            console.log("⚡ Update suara masuk!");
            renderStats(updatedData);
        } catch (err) {
            console.error("Gagal parse data stream:", err);
        }
    };

    // eventSource.onerror = (err) => {
    //     console.warn("Stream terputus, mencoba menyambung kembali...");
    //     eventSource.close();
    //     // Coba sambung lagi setelah 5 detik jika error
    //     setTimeout(setupRealtimeUpdate, 5000);
    // };
}

// --- 4. Core Logic: Fetch Data Awal ---
async function fetchResults() {
    try {
        const res = await fetch(`${BACKEND_URL}/results`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        if (!res.ok) throw new Error('Gagal mengambil data dari server');
        const data = await res.json();
        if (data && Array.isArray(data)) {
            renderStats(data);
        }
    } catch (e) {
        console.error("Dashboard Error:", e);
        const chartContainer = document.getElementById('chartContainer');
        chartContainer.innerHTML = `<div class="alert alert-danger text-center">Gagal memuat data.</div>`;
    }
}

// --- 5. Render Logic ---
function renderStats(candidates) {
    const totalVotes = candidates.reduce((sum, cand) => sum + (Number(cand.votes) || 0), 0);
    
    // Update total votes dengan animasi angka
    const totalElement = document.getElementById('totalVotes');
    const startVal = parseInt(totalElement.innerText.replace(/\./g, '')) || 0;
    animateValue("totalVotes", startVal, totalVotes, 1000);

    const chartContainer = document.getElementById('chartContainer');
    const cardsContainer = document.getElementById('candidateCards');

    let chartHTML = '';
    let cardsHTML = '';

    candidates.forEach(cand => {
        const votes = Number(cand.votes) || 0;
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        const barColor = cand.warna || '#2563eb';

        chartHTML += `
            <div class="vote-bar-wrapper animate-fade-in">
                <div class="progress-label">
                    <span class="text-truncate" style="max-width: 70%">Kandidat No. ${cand.noUrut}</span>
                    <span class="text-accent fw-bold">${percentage}% <small class="text-muted fw-normal">(${votes} Suara)</small></span>
                </div>
                <div class="progress">
                    <div class="progress-bar" 
                         style="width: ${percentage}%; background-color: ${barColor}">
                    </div>
                </div>
            </div>`;

        cardsHTML += `
            <div class="col-md-6 col-lg-4 animate-fade-in">
                <div class="cand-detail-card">
                    <img src="${getFullImageUrl(cand.foto)}" class="cand-detail-img" onerror="this.src='/img/default.png'">
                    <div class="overflow-hidden">
                        <h6 class="fw-bold mb-0 text-truncate">${cand.nama}</h6>
                        <small class="text-muted">Kandidat No. ${cand.noUrut}</small>
                        <div class="mt-1">
                             <span class="badge rounded-pill" style="background-color: ${barColor}22; color: ${barColor};">
                                 ${votes} Suara
                             </span>
                        </div>
                    </div>
                </div>
            </div>`;
    });

    chartContainer.innerHTML = chartHTML;
    cardsContainer.innerHTML = cardsHTML;
}

// --- 6. UI Helpers ---
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (start === end) return;
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / (range || 1)));
    const timer = setInterval(function() {
        current += increment;
        obj.innerText = current.toLocaleString('id-ID');
        if (current == end) clearInterval(timer);
    }, stepTime || 10);
}

function initTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    document.getElementById('theme-toggle').addEventListener('click', () => {
        const isDark = html.getAttribute('data-theme') === 'dark';
        const target = isDark ? 'light' : 'dark';
        html.setAttribute('data-theme', target);
        localStorage.setItem('theme-preference', target);
        themeIcon.className = target === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
    });
}

function logout() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    Swal.fire({
        title: 'Konfirmasi Keluar',
        html: `Setelah keluar, Anda tidak dapat masuk kembali ke dashboard ini untuk menjaga integritas data. Anda yakin?`,
        icon: 'warning',
        iconColor: '#ef4444',
        showCancelButton: true,
        confirmButtonText: 'Ya, Keluar',
        cancelButtonText: 'Batal',
        
        customClass: {
            popup: 'swal2-popup-custom',
            title: 'swal2-title-custom',
            htmlContainer: 'swal2-html-custom',
            actions: 'swal2-actions', // Penting untuk gap
            confirmButton: 'swal2-confirm-custom btn btn-danger shadow-sm',
            cancelButton: 'swal2-cancel-custom btn btn-light border shadow-sm'
        },
        
        background: isDark ? '#0f172a' : '#ffffff',
        buttonsStyling: false,
        reverseButtons: true // Memposisikan Batal di kiri, Keluar di kanan
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.clear();
            window.location.href = '../index.html';
        }
    });
}

/**
 * Logika Sinkronisasi Waktu (Mirip user.js)
 */
async function checkVotingStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();
        
        const timerLabel = document.getElementById('timerLabel');
        const timerDisplay = document.getElementById('navTimerValue');
        const statusPulse = document.getElementById('statusPulse'); // Dot status

        if (countdownInterval) clearInterval(countdownInterval);

        if (data.status === 'active') {
            // --- SEDANG BERLANGSUNG (HIJAU) ---
            statusPulse.style.backgroundColor = '#10b981'; 
            statusPulse.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.7)';
            timerLabel.innerText = 'BERAKHIR DALAM';
            
            runTimer(data.targetTime, timerDisplay, () => {
                // Saat waktu habis otomatis jadi merah
                statusPulse.style.backgroundColor = '#ef4444';
                statusPulse.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.7)';
                timerLabel.innerText = 'WAKTU HABIS';
                timerDisplay.innerText = "00:00:00";
            });

        } else if (data.status === 'upcoming') {
            // --- BELUM DIMULAI (KUNING/ORANGE) ---
            statusPulse.style.backgroundColor = '#f59e0b';
            statusPulse.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.7)';
            timerLabel.innerText = 'BELUM DIMULAI';
            timerDisplay.innerText = "--:--:--";

        } else {
            // --- SELESAI (MERAH) ---
            statusPulse.style.backgroundColor = '#ef4444';
            statusPulse.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.7)';
            timerLabel.innerText = 'STATUS VOTING';
            timerDisplay.innerText = "SELESAI";
        }
    } catch (err) {
        console.error("Gagal cek status:", err);
    }
}

/**
 * Mesin Timer
 */
function runTimer(targetTime, displayElement, onFinish) {
    function update() {
        const now = new Date().getTime();
        const diff = targetTime - now;

        if (diff <= 0) {
            clearInterval(countdownInterval);
            displayElement.innerText = "00:00:00";
            if (onFinish) onFinish();
            return;
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        displayElement.innerText = 
            `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }

    update();
    countdownInterval = setInterval(update, 1000);
}