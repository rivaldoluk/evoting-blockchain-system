const BACKEND_URL = 'https://8eb2-103-129-24-89.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let countdownInterval = null;
let receiptModalInstance = null;

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
    initSmartStatus();
    initTheme();
    fetchResults(); // Ambil data awal saat pertama kali buka
    setupRealtimeUpdate();
    checkVotingStatus();
    checkNewVoteReceipt();
});

// --- 3. Setup Real-time Update (Native SSE) ---
function setupRealtimeUpdate() {
    const eventSource = new EventSource(`${BACKEND_URL}/results-stream`);

    eventSource.onmessage = (event) => {
        try {
            const updatedData = JSON.parse(event.data);
            console.log("⚡ Update suara masuk!");
            renderStats(updatedData);

            // TAMBAHKAN INI:
            // Setiap ada update suara, cek apakah modal struk kita perlu di-update statusnya
            checkReceiptStatus(updatedData);
        } catch (err) {
            console.error("Gagal parse data stream:", err);
        }
    };
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
        chartContainer.innerHTML = `<div class="col-12 text-center py-5" style="animation: fadeIn 0.5s ease;">
            <div class="mb-4">
                <i class="bi bi-cloud-slash display-1 text-muted"></i>
            </div>
            <h4 class="fw-bold">Gagal Memuat Data Perolehan Suara</h4>
            <p class="text-secondary mb-4">Terjadi masalah koneksi ke server. Silakan coba muat ulang halaman.</p>
            
            <button onclick="location.reload()" class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm">
                <i class="bi bi-arrow-clockwise me-2"></i> Muat Ulang Halaman
            </button>
        </div>`;
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
    const syncText = document.getElementById('lastUpdateText');

    if (syncText) {
        syncText.innerText = `Last Update: ${new Date().toLocaleTimeString('id-ID')}`;
        
        // Tambahkan efek flash pada parent (sync-badge)
        const badge = syncText.closest('.sync-badge');
        if (badge) {
            badge.style.backgroundColor = "rgba(16, 185, 129, 0.2)"; // Hijau emerald transparan
            badge.style.transform = "scale(1.05)";
            
            setTimeout(() => {
                badge.style.backgroundColor = ""; // Kembali ke CSS asal
                badge.style.transform = "";
            }, 600);
        }
    }

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
    const timer = setInterval(function () {
        current += increment;
        obj.innerText = current.toLocaleString('id-ID');
        if (current == end) clearInterval(timer);
    }, stepTime || 10);
}

function initTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');

    // Fungsi sinkronisasi ikon
    const syncIcon = (theme) => {
        if (theme === 'dark') {
            themeIcon.className = 'bi bi-moon-stars-fill';
        } else {
            themeIcon.className = 'bi bi-sun-fill';
        }
    };

    // Set ikon awal saat load
    syncIcon(html.getAttribute('data-theme'));

    document.getElementById('theme-toggle').addEventListener('click', () => {
        const currentTheme = html.getAttribute('data-theme');
        const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // Animasi transisi smooth
        html.style.transition = 'background-color 0.5s ease, color 0.5s ease';

        localStorage.setItem('theme-preference', targetTheme);
        html.setAttribute('data-theme', targetTheme);
        syncIcon(targetTheme);
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

function initSmartStatus() {
    const statusArea = document.querySelector('.smart-status-area');
    const miniAddress = document.getElementById('miniAddress');

    const txHash = sessionStorage.getItem('lastVoteTx');
    const userAddress = sessionStorage.getItem('voterAddress');

    if (txHash && statusArea) {
        statusArea.style.display = 'block';

        if (userAddress && miniAddress) {
            // Format: 0x1234...ABCD
            const shortAddr = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
            miniAddress.innerText = shortAddr;
        }
    } else {
        if (statusArea) statusArea.style.display = 'none';
    }
}

// Helper: Persingkat Hash (0x1234...abcd)
function shortenHash(hash, start = 8, end = 6) {
    if (!hash || hash.length < 15) return hash;
    return `${hash.substring(0, start)}...${hash.substring(hash.length - end)}`;
}

// Helper: Copy dengan Feedback Visual
function copyText(elementId, event) {
    const el = document.getElementById(elementId);
    const btn = event.currentTarget; 
    const txHash = sessionStorage.getItem('lastVoteTx');

    // CEK: Jika yang diklik adalah tombol Tx Hash tapi hash belum ada, JANGAN LANJUT
    if (elementId === 'receiptTxHash' && (!txHash || txHash === "undefined")) {
        console.warn("Percobaan salin gagal: Tx Hash belum tersedia.");
        return; 
    }

    const textToCopy = el.getAttribute('data-full-hash') || el.innerText;

    // Tambahan proteksi jika teks masih mengandung spinner atau placeholder
    if (!textToCopy || textToCopy.includes('Menunggu') || textToCopy.includes('0x...')) {
        return;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        showCopyToast("Berhasil disalin"); // Pakai pesan default

        const originalHTML = btn.innerHTML;
        
        if (btn.classList.contains('btn-copy-premium')) {
            btn.innerHTML = `<i class="bi bi-check2-all text-success"></i> <span class="text-success">Tersalin</span>`;
            btn.classList.add('border-success');
        } else {
            btn.innerHTML = `<i class="bi bi-check2-all text-success"></i>`;
            btn.style.transform = "scale(1.2)";
        }

        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.classList.remove('border-success');
            btn.style.transform = "";
        }, 2000);

    }).catch(err => console.error('Gagal salin:', err));
}

function showCopyToast(message = "Berhasil disalin", iconClass = "bi-check-circle-fill", iconColor = "#10b981") {
    const toast = document.getElementById('copyToast');
    const toastText = document.getElementById('toastText');
    const toastIcon = document.getElementById('toastIcon');

    // Set pesan dan ikon secara dinamis
    toastText.innerText = message;
    toastIcon.className = `bi ${iconClass} me-2`;
    toastIcon.style.color = iconColor;

    // Slide Up
    toast.classList.add('show');

    // Slide Down setelah 2 detik
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

function showReceiptModal() {
    const txHash = sessionStorage.getItem('lastVoteTx');
    const statusArea = document.querySelector('.glass-widget');

    if (!txHash) {
        Swal.fire({
            title: '<span class="swal-title-custom">Data Tidak Ditemukan</span>',
            html: `
                <div class="swal-content-custom">
                    <div class="empty-data-icon">
                        <i class="bi bi-search-heart"></i>
                    </div>
                    <p class="mt-3 text-muted">Bukti suara digital tidak tersedia atau sesi Anda telah berakhir.</p>
                </div>
            `,
            showConfirmButton: true,
            confirmButtonText: 'Mengerti',
            buttonsStyling: false,
            customClass: {
                popup: 'swal-premium-popup',
                confirmButton: 'btn-swal-confirm'
            },
            showClass: {
                popup: 'animate__animated animate__fadeInUp animate__faster'
            },
            hideClass: {
                popup: 'animate__animated animate__fadeOutDown animate__faster'
            }
        }).then((result) => {
    if (result.isConfirmed) {
        window.location.reload(); // Fungsi refresh halaman
    }
});
        return;
    }

    fillReceiptData();

    const modalEl = document.getElementById('voteReceiptModal');
    if (!receiptModalInstance) {
        receiptModalInstance = new bootstrap.Modal(modalEl);
    }

    if (!modalEl.classList.contains('show')) {
        receiptModalInstance.show();
        statusArea.style.opacity = '0.7';
        modalEl.addEventListener('hidden.bs.modal', () => {
            statusArea.style.opacity = '1';
        }, { once: true });
    }
}

// Ganti fungsi fillReceiptData Anda dengan ini
function fillReceiptData() {
    const txHash = sessionStorage.getItem('lastVoteTx');
    const nik = sessionStorage.getItem('voterNIK');
    const time = sessionStorage.getItem('lastVoteTime');
    const userAddress = sessionStorage.getItem('voterAddress'); // Ini nikHash dari backend

    // --- SETUP ELEMENT ---
    const addrEl = document.getElementById('receiptAddress');
    const hashEl = document.getElementById('receiptTxHash');
    const statusBadge = document.getElementById('receiptStatus');
    const explorerBtn = document.getElementById('receiptExplorer');
    
    // Ambil tombol copy berdasarkan fungsi onclick-nya
    const copyBtnAddr = document.querySelector('[onclick="copyText(\'receiptAddress\', event)"]');
    const copyBtnHash = document.querySelector('[onclick="copyText(\'receiptTxHash\', event)"]');

    // NIK & Time (Selalu tampil karena input user)
    if (nik) document.getElementById('receiptNIK').innerText = nik.substring(0, 4) + "••••" + nik.substring(12);
    const dateObj = time ? new Date(time) : new Date();
    document.getElementById('receiptTime').innerText = dateObj.toLocaleString('id-ID');

    // --- LOGIKA VALIDASI (SUDAH ADA TX HASH) ---
    if (txHash && txHash !== "undefined" && txHash !== "null") {
        
        // 1. Tampilkan Alamat Pemilih (NIK Hash)
        if (userAddress) {
            addrEl.innerText = shortenHash(userAddress, 6, 4);
            addrEl.setAttribute('data-full-hash', userAddress);
            if (copyBtnAddr) {
                copyBtnAddr.classList.remove('disabled-btn');
                copyBtnAddr.style.opacity = "1";
                copyBtnAddr.style.pointerEvents = "auto";
            }
        }

        // 2. Tampilkan Transaction Hash
        hashEl.innerText = shortenHash(txHash, 8, 6);
        hashEl.setAttribute('data-full-hash', txHash);
        if (copyBtnHash) {
            copyBtnHash.classList.remove('disabled-btn');
            copyBtnHash.style.opacity = "1";
            copyBtnHash.style.pointerEvents = "auto";
        }

        // 3. Aktifkan Tombol Explorer & Status
        explorerBtn.classList.remove('disabled');
        explorerBtn.style.pointerEvents = "auto";
        explorerBtn.style.opacity = "1";
        explorerBtn.href = `https://sepolia.etherscan.io/tx/${txHash}`;
        
        updateStatusToSuccess(statusBadge);

    } 
    // --- LOGIKA LOADING (ANTREAN BATCH) ---
    else {
        // 1. Loading Alamat Pemilih
        addrEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" style="width: 10px; height: 10px;"></span> Memproses...`;
        if (copyBtnAddr) {
            copyBtnAddr.classList.add('disabled-btn');
            copyBtnAddr.style.opacity = "0.3";
            copyBtnAddr.style.pointerEvents = "none";
        }

        // 2. Loading Transaction Hash
        hashEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" style="width: 10px; height: 10px;"></span> Memproses...`;
        if (copyBtnHash) {
            copyBtnHash.classList.add('disabled-btn');
            copyBtnHash.style.opacity = "0.3";
            copyBtnHash.style.pointerEvents = "none";
        }

        if (statusBadge) {
        statusBadge.innerHTML = `
            <i class="bi bi-hourglass-split me-1 anim-hourglass"></i> 
            Pending
        `;
        statusBadge.className = "badge-status-receipt pending";
    }

        // 3. Matikan Tombol Explorer
        explorerBtn.classList.add('disabled');
        explorerBtn.style.pointerEvents = "none";
        explorerBtn.style.opacity = "0.5";

        // Jalankan detektif polling
        startPollingStatus();
    }
}

// Fungsi "Detektif" untuk bertanya ke server
let pollInterval = null;
function startPollingStatus() {
    if (pollInterval) return; // Jangan jalankan dua kali

    const nik = sessionStorage.getItem('voterNIK');
    if (!nik) return;

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/check-vote-status/${nik}`, {
                headers: NGROK_HEADERS
            });
            const data = await res.json();

            if (data.status === 'confirmed') {
                console.log("🚀 Tx Hash ditemukan! Mengupdate UI...");
                
                // Simpan ke session
                sessionStorage.setItem('lastVoteTx', data.txHash);
                sessionStorage.setItem('voterAddress', data.nikHash);
                
                // Stop Polling
                clearInterval(pollInterval);
                pollInterval = null;

                // Update Tampilan Struk & Widget Smart Status
                fillReceiptData();
                initSmartStatus();
                showCopyToast("Success", "bi-shield-check", "#10b981");
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }, 4000); // Tanya setiap 4 detik (Aman untuk Ngrok)
}

// --- 7. Helpers & Utilities ---
function checkNewVoteReceipt() {
    if (sessionStorage.getItem('isNewVote') === 'true') {
        showReceiptModal();
        sessionStorage.removeItem('isNewVote');
    }
}

function updateStatusToSuccess(element) {
    if (element) {
        // 1. Tambahkan efek transisi keluar sebentar (opsional)
        element.style.opacity = '0';
        
        setTimeout(() => {
            // 2. Ganti class dari pending ke success
            element.classList.remove('pending');
            element.classList.add('success');
            
            // 3. Update konten dengan ikon yang lebih elegan
            element.innerHTML = `
                <i class="bi bi-check-circle-fill me-1 animate-pop"></i> 
                Terkonfirmasi
            `;
            
            // 4. Munculkan kembali dengan transisi
            element.style.opacity = '1';
        }, 200);
    }
}

function refreshPage() {
    // Memberikan sedikit efek transisi sebelum reload
    document.body.style.opacity = '0.5';
    location.reload();
}