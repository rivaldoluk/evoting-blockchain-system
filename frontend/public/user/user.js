const BACKEND_URL = 'https://15ed-103-129-24-34.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let selectedCandidateId = null;
let countdownInterval = null;

function getFullImageUrl(path) {
    if (!path) return '/img/default.png';
    if (path.startsWith('http')) return path;
    const fileName = path.split('/').pop();
    return `/img/${fileName}`; // Mengambil langsung dari public Vercel
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initTheme();
    loadCandidates();
    initSwipeLogic();
    // Tambahkan pemanggilan status voting
    checkVotingStatus(); 
});

/**
 * Validasi Auth & Sensor NIK
 */
function initAuth() {
    const nik = sessionStorage.getItem('voterNIK');
    if (!nik) {
        window.location.href = '../index.html';
        return;
    }
    // Menampilkan NIK dengan sensor tengah yang lebih rapi
    const maskedNIK = `${nik.substring(0, 4)}••••${nik.substring(12)}`;
    document.getElementById('displayNIK').innerText = `NIK: ${maskedNIK}`;
}

/**
 * Load Data Kandidat dengan Animasi Muncul (Staggered)
 */
async function loadCandidates() {
    try {
        const res = await fetch(`${BACKEND_URL}/results`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();
        const grid = document.getElementById('candidateGrid');
        
        grid.innerHTML = data.map((cand, index) => `
            <div class="col-md-6 col-lg-4" style="animation: fadeIn 0.6s ease forwards ${index * 0.1}s; opacity: 0;">
                <div class="candidate-card" onclick="openVoteModal('${cand.id}', '${cand.nama}', '${cand.noUrut}', '${cand.foto}')">
                    <div class="candidate-number">${cand.noUrut}</div>
                    
                    <img src="${getFullImageUrl(cand.foto)}" class="img-circle" alt="${cand.nama}" onerror="this.src='/img/default.png'">
                    <h4 class="fw-extrabold mb-1 tracking-tight">${cand.nama}</h4>
                    <p class="text-secondary small mb-4"></p>
                    <button class="btn btn-outline-primary btn-sm rounded-pill px-4 fw-bold">Pilih Calon</button>
                </div>
            </div>
        `).join('');
    } catch (e) { 
        console.error("Error loading candidates", e);
    document.getElementById('candidateGrid').innerHTML = `
        <div class="col-12 text-center py-5" style="animation: fadeIn 0.5s ease;">
            <div class="mb-4">
                <i class="bi bi-cloud-slash display-1 text-muted"></i>
            </div>
            <h4 class="fw-bold">Gagal Memuat Kandidat</h4>
            <p class="text-secondary mb-4">Terjadi masalah koneksi ke server. Silakan coba muat ulang halaman.</p>
            
            <button onclick="location.reload()" class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm">
                <i class="bi bi-arrow-clockwise me-2"></i> Muat Ulang Halaman
            </button>
        </div>`;
    }
}

/**
 * Membuka Modal dengan Reset State
 */
function openVoteModal(id, nama, noUrut, foto) {
    selectedCandidateId = id;
    document.getElementById('confirmNama').innerText = nama;
    document.getElementById('confirmNoUrut').innerText = `Kandidat Nomor ${noUrut}`;
    document.getElementById('confirmImg').src = getFullImageUrl(foto);

    // Reset modal ke state awal (Konfirmasi)
    document.getElementById('voteStateConfirm').style.display = 'block';
    document.getElementById('voteStateSuccess').style.display = 'none';
    resetSwipe();

    const voteModal = new bootstrap.Modal('#confirmVoteModal');
    voteModal.show();
}

/**
 * Logika Interaksi Swipe (Geser)
 */
function initSwipeLogic() {
    const handle = document.getElementById('swipeHandle');
    const track = document.getElementById('swipeTrack');
    let isDragging = false;
    let startX = 0;

    // Cegah aksi default browser (seperti scroll saat menggeser tombol)
    const preventDefaults = (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    handle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        // Ambil posisi kursor/sentuhan awal relatif terhadap handle
        startX = e.clientX;
        
        handle.setPointerCapture(e.pointerId);
        handle.style.transition = 'none';
        handle.classList.add('grabbing');
    });

    handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        
        // Mencegah scroll layar saat jari menggeser tombol
        preventDefaults(e);

        let deltaX = e.clientX - startX;
        const maxMove = track.offsetWidth - handle.offsetWidth - 10;

        // Batasi gerakan agar tidak keluar jalur
        if (deltaX < 0) deltaX = 0;
        if (deltaX > maxMove) deltaX = maxMove;

        handle.style.transform = `translateX(${deltaX}px)`;
        
        // Efek visual teks memudar
        const opacityValue = 1 - (deltaX / maxMove);
        document.querySelector('.swipe-text').style.opacity = Math.max(opacityValue, 0.1);

        // Jika sampai ujung (98% dari maxMove)
        if (deltaX >= maxMove * 0.98) {
            isDragging = false;
            handle.style.transform = `translateX(${maxMove}px)`;
            processVoting();
        }
    });

    handle.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        handle.releasePointerCapture(e.pointerId);
        resetSwipe();
    });

    // Tambahan untuk menangani jika pointer keluar dari area (cancel)
    handle.addEventListener('pointercancel', () => {
        isDragging = false;
        resetSwipe();
    });
}

function resetSwipe() {
    const handle = document.getElementById('swipeHandle');
    handle.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    handle.style.transform = 'translateX(0)';
    document.querySelector('.swipe-text').style.opacity = 0.3; // Kembali ke transparan awal
    handle.innerHTML = '<i class="bi bi-chevron-double-right"></i>';
}

/**
 * Proses Pengiriman Suara (Voting)
 */
async function processVoting() {
    const handle = document.getElementById('swipeHandle');
    const swipeText = document.querySelector('.swipe-text');
    
    // 1. State Loading
    handle.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    handle.style.pointerEvents = 'none';

    try {
        const res = await fetch(`${BACKEND_URL}/vote`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...NGROK_HEADERS },
            body: JSON.stringify({
                nik: sessionStorage.getItem('voterNIK'),
                token: sessionStorage.getItem('voterToken'),
                candidateId: selectedCandidateId
            })
        });

        const data = await res.json();

        if (res.status === 429) {
            showConcurrentAlert();
            return;
        }

        if (data.success) {
            // 2. State Berhasil (Ubah jadi Centang)
            handle.innerHTML = '<i class="bi bi-check-lg"></i>';
            handle.style.background = '#10b981'; // Warna hijau sukses
            swipeText.innerText = "SUARA BERHASIL DIKIRIM!";
            swipeText.style.opacity = "1";

            sessionStorage.setItem('votingCompleted', 'true');
            localStorage.setItem('hasVoted', 'true');

            window.history.replaceState(null, null, '../dashboard/dashboard.html');

            // Tunggu sebentar agar user lihat centangnya, baru pindah state modal
            setTimeout(() => {
                const confirmState = document.getElementById('voteStateConfirm');
                const successState = document.getElementById('voteStateSuccess');
                
                confirmState.style.display = 'none';
                successState.style.display = 'block';

                // 3. Jalankan Countdown Redirect
                startRedirectCountdown(5);
            }, 1000);

            // Tambahkan event listener untuk tombol sukses di modal
document.querySelector('#voteStateSuccess a').addEventListener('click', function(e) {
    e.preventDefault();
    // replace tidak meninggalkan jejak di history
    window.location.replace('../dashboard/dashboard.html'); 
});

        } else {
            showErrorVoteModal(data.error);
            resetSwipe();
        }
    } catch (e) {
        showNetworkErrorModal();
        resetSwipe();
    }
}

// --- TAMBAHKAN FUNGSI BARU INI DI PALING BAWAH user.js ---
function showConcurrentAlert(customMessage) {
    // 1. Tutup modal vote jika sedang terbuka
    const voteModalEl = document.getElementById('confirmVoteModal');
    if (voteModalEl) {
        const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
        if (voteModalInstance) voteModalInstance.hide();
    }

    // 2. Update pesan jika ada pesan khusus
    if (customMessage) {
        document.getElementById('concurrentMessage').innerText = customMessage;
    }

    // 3. Tampilkan modal keamanan sesi
    const concurrentModal = new bootstrap.Modal(document.getElementById('concurrentModal'));
    concurrentModal.show();

    // 4. Jalankan Countdown (5 detik)
    let timeLeft = 5;
    const countdownEl = document.getElementById('concurrentCountdown');

    const timer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            clearAndExit(); // Fungsi redirect & clear session yang sudah Anda buat
        }
    }, 1000);
}

function showErrorVoteModal(message) {
    // Tutup modal konfirmasi jika masih terbuka
    const voteModalEl = document.getElementById('confirmVoteModal');
    const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
    if (voteModalInstance) voteModalInstance.hide();

    // Isi pesan errornya
    document.getElementById('errorVoteMessage').innerText = message;

    // Tampilkan modal error
    const errorModal = new bootstrap.Modal(document.getElementById('errorVoteModal'));
    errorModal.show();

    let timeLeft = 5;
    const countdownEl = document.getElementById('errorCountdown');
    
    const timer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            clearAndExit(); // Panggil fungsi redirect yang sudah ada
        }
    }, 1000);
}

function showNetworkErrorModal() {
    // Tutup modal konfirmasi jika masih terbuka
    const voteModalEl = document.getElementById('confirmVoteModal');
    const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
    if (voteModalInstance) voteModalInstance.hide();

    // Tampilkan modal koneksi
    const netModal = new bootstrap.Modal(document.getElementById('networkErrorModal'));
    netModal.show();
}

// Fungsi bantu untuk keluar (Tetap sama)
function clearAndExit() {
    sessionStorage.clear();
    window.location.href = '../index.html';
}

function refreshPage() {
    // Memberikan sedikit efek transisi sebelum reload
    document.body.style.opacity = '0.5';
    location.reload();
}

// Fungsi Countdown Baru
function startRedirectCountdown(seconds) {
    let timeLeft = seconds;
    const timerElement = document.getElementById('redirectTimer');
    
    const interval = setInterval(() => {
        timeLeft--;
        if (timerElement) timerElement.innerText = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(interval);
            window.location.replace('../dashboard/dashboard.html');
        }
    }, 1000);
}

/**
 * Manajemen Tema (Dark/Light) dengan Sinkronisasi Ikon
 */
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

/**
 * Mengambil status voting dari backend
 */
async function checkVotingStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();

        // Ambil elemen dari Navbar user.html
        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const timerLabel = document.querySelector('.timer-label');
        const timerDisplay = document.getElementById('navTimerValue');
        const grid = document.getElementById('candidateGrid');
        const swipeTrack = document.getElementById('swipeTrack');

        if (countdownInterval) clearInterval(countdownInterval);

        if (data.status === 'active') {
            // UI AKTIF
            statusDot.style.backgroundColor = '#10b981'; // Hijau
            statusText.innerText = 'Berlangsung';
            timerLabel.innerText = 'BERAKHIR DALAM:';
            
            // Aktifkan Card
            grid.style.pointerEvents = 'auto';
            grid.style.opacity = '1';

            if(swipeTrack) {
                swipeTrack.style.pointerEvents = 'auto';
                swipeTrack.style.opacity = '1';
            }

            runTimer(data.targetTime, timerDisplay, () => {
                // Callback jika waktu habis saat sedang buka halaman
                statusDot.style.backgroundColor = '#ef4444'; // Merah
                statusText.innerText = 'Selesai';
                timerLabel.innerText = 'WAKTU HABIS:';
                timerDisplay.innerText = "00:00:00";
                grid.style.pointerEvents = 'none';
                grid.style.opacity = '0.6';

                // DISABLE TOMBOL SWIPE
                if(swipeTrack) {
                    swipeTrack.style.pointerEvents = 'none'; // Mematikan geser
                    swipeTrack.style.opacity = '0.5'; // Ubah warna jadi merah muda (soft red)
                    document.querySelector('.swipe-text').innerText = "VOTING CLOSED";
                    //document.querySelector('.swipe-text').style.color = "#dc2626";
                }
            });

        } else if (data.status === 'upcoming') {
            // UI BELUM DIMULAI
            statusDot.style.backgroundColor = '#f59e0b'; // Kuning/Orange
            statusText.innerText = 'Menunggu';
            timerLabel.innerText = 'BELUM DIMULAI';
            timerDisplay.innerText = "--:--:--";
            
            // Disable Card
            grid.style.pointerEvents = '';
            grid.style.opacity = '0.6';

            // DISABLE TOMBOL SWIPE (Penting jika user buka modal lewat konsol)
            if(swipeTrack) {
                    swipeTrack.style.pointerEvents = 'none'; // Mematikan geser
                    swipeTrack.style.opacity = '0.6'; // Ubah warna jadi merah muda (soft red)
                    document.querySelector('.swipe-text').innerText = "VOTING BELUM DIMULAI";
                }

        } else {
            // UI SELESAI
            statusDot.style.backgroundColor = '#ef4444'; // Merah
            statusText.innerText = 'Selesai';
            timerLabel.innerText = 'VOTING SELESAI';
            //timerDisplay.innerText = "CLOSED";
            
            // Disable Card
            grid.style.pointerEvents = '';
            grid.style.opacity = '0.6';

            // DISABLE TOMBOL SWIPE (Penting jika user buka modal lewat konsol)
            if(swipeTrack) {
                    swipeTrack.style.pointerEvents = 'none'; // Mematikan geser
                    swipeTrack.style.opacity = '0.6'; // Ubah warna jadi merah muda (soft red)
                    document.querySelector('.swipe-text').innerText = "VOTING SELESAI";
                }
        }
    } catch (err) {
        console.error("Gagal cek status:", err);
    }
}

/**
 * Mesin Countdown
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