const BACKEND_URL = 'https://6c09-172-216-170-152.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};

let selectedCandidateId = null;
let countdownInterval = null;
let allCandidatesData = [];

// === SISTEM MULTI-BAHASA (i18n) ===
let currentLang = localStorage.getItem('preferredLang') || 'id';
let currentTranslations = {};

function t(key, fallback = '') {
    return currentTranslations[key] || fallback;
}

async function fetchLanguageData(lang) {
    try {
        const response = await fetch(`${BACKEND_URL}/lang/${lang}`, {
            headers: NGROK_HEADERS
        });
        if (!response.ok) throw new Error('Gagal mengambil data bahasa');
        return await response.json();
    } catch (err) {
        console.error("Gagal memuat file bahasa:", err);
        return null;
    }
}

async function updateContent(lang) {
    const translations = await fetchLanguageData(lang);
    if (!translations) return;

    currentTranslations = translations;

    // 1. Update elemen HTML ber-atribut data-i18n
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            element.innerHTML = translations[key];
        }
    });

    // 2. Simpan preferensi bahasa
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    // 3. Highlight tombol aktif (ID / EN) jika ada di Navbar
    const btnId = document.getElementById('btn-lang-id');
    const btnEn = document.getElementById('btn-lang-en');
    if (btnId && btnEn) {
        btnId.classList.toggle('active', lang === 'id');
        btnEn.classList.toggle('active', lang === 'en');
    }

    // Refresh elemen dinamis
    if (allCandidatesData.length > 0) {
        renderCandidates(allCandidatesData);
    }
    checkVotingStatus();
}

function changeLanguage(lang) {
    currentLang = lang;
    updateContent(lang);
}

function getFullImageUrl(path) {
    if (!path) return '/img/default.png';
    if (path.startsWith('http')) return path;
    const fileName = path.split('/').pop();
    return `/img/${fileName}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    initAuth();
    initTheme();
    
    // Muat data terjemahan terlebih dahulu
    await updateContent(currentLang);
    
    // Setelah terjemahan siap, baru load kandidat dan status voting
    loadCandidates();
    initSwipeLogic();
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
    const maskedNIK = `${nik.substring(0, 4)}••••${nik.substring(12)}`;
    document.getElementById('displayNIK').innerText = `NIK: ${maskedNIK}`;
}

/**
 * Load Data Kandidat dengan Animasi Muncul (Staggered)
 */
async function loadCandidates() {
    try {
        const res = await fetch(`${BACKEND_URL}/results`, {
            headers: NGROK_HEADERS
        });
        allCandidatesData = await res.json();
        renderCandidates(allCandidatesData);
    } catch (e) { 
        console.error("Error loading candidates", e);
        document.getElementById('candidateGrid').innerHTML = `
            <div class="col-12 text-center py-5" style="animation: fadeIn 0.5s ease;">
                <div class="mb-4">
                    <i class="bi bi-cloud-slash display-1 text-muted"></i>
                </div>
                <h4 class="fw-bold">${t('net_error_title', 'Gagal Memuat Kandidat')}</h4>
                <p class="text-secondary mb-4">${t('net_error_desc', 'Terjadi masalah koneksi ke server. Silakan coba muat ulang halaman.')}</p>
                
                <button onclick="location.reload()" class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm">
                    <i class="bi bi-arrow-clockwise me-2"></i> ${t('btn_try_again', 'Muat Ulang Halaman')}
                </button>
            </div>`;
    }
}

function renderCandidates(data) {
    const grid = document.getElementById('candidateGrid');
    if (!grid) return;

    grid.innerHTML = data.map((cand, index) => {
        const taglineText = (currentLang === 'en' && cand.tagline_en) ? cand.tagline_en : cand.tagline;
        
        return `
            <div class="col-md-6 col-lg-4" style="animation: fadeIn 0.6s ease forwards ${index * 0.1}s; opacity: 0;">
                <div class="candidate-card" onclick="openVoteModal('${cand.id}', '${cand.nama}', '${cand.noUrut}', '${cand.foto}')">
                    <div class="candidate-number">${cand.noUrut}</div>
                    
                    <img src="${getFullImageUrl(cand.foto)}" class="img-circle" alt="${cand.nama}" onerror="this.src='/img/default.png'">
                    <h4 class="fw-extrabold mb-1 tracking-tight">${cand.nama}</h4>
                    <p class="text-secondary small mb-4">${taglineText || ''}</p>
                    <button class="btn btn-outline-primary btn-sm rounded-pill px-4 fw-bold">
                        ${t('btn_select_candidate', 'Pilih Calon')}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Membuka Modal dengan Reset State
 */
function openVoteModal(id, nama, noUrut, foto) {
    selectedCandidateId = id;
    document.getElementById('confirmNama').innerText = nama;
    
    const candidatePrefix = currentLang === 'en' ? 'Candidate Number' : 'Kandidat Nomor';
    document.getElementById('confirmNoUrut').innerText = `${candidatePrefix} ${noUrut}`;
    document.getElementById('confirmImg').src = getFullImageUrl(foto);

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
    if (!handle || !track) return;

    let isDragging = false;
    let startX = 0;

    const preventDefaults = (e) => {
        if (isDragging) {
            e.preventDefault();
            e.stopPropagation();
        }
    };

    handle.addEventListener('pointerdown', (e) => {
        isDragging = true;
        startX = e.clientX;
        
        handle.setPointerCapture(e.pointerId);
        handle.style.transition = 'none';
        handle.classList.add('grabbing');
    });

    handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        
        preventDefaults(e);

        let deltaX = e.clientX - startX;
        const maxMove = track.offsetWidth - handle.offsetWidth - 10;

        if (deltaX < 0) deltaX = 0;
        if (deltaX > maxMove) deltaX = maxMove;

        handle.style.transform = `translateX(${deltaX}px)`;
        
        const opacityValue = 1 - (deltaX / maxMove);
        const swipeTextEl = document.querySelector('.swipe-text');
        if (swipeTextEl) swipeTextEl.style.opacity = Math.max(opacityValue, 0.1);

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

    handle.addEventListener('pointercancel', () => {
        isDragging = false;
        resetSwipe();
    });
}

function resetSwipe() {
    const handle = document.getElementById('swipeHandle');
    const swipeText = document.querySelector('.swipe-text');
    if (!handle) return;

    handle.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    handle.style.transform = 'translateX(0)';
    handle.style.pointerEvents = 'auto';
    handle.style.background = '';
    
    if (swipeText) {
        swipeText.style.opacity = 0.3;
        swipeText.innerText = t('swipe_text', 'GESER UNTUK VOTE');
    }
    handle.innerHTML = '<i class="bi bi-chevron-double-right"></i>';
}

/**
 * Proses Pengiriman Suara (Voting)
 */
async function processVoting() {
    const handle = document.getElementById('swipeHandle');
    const swipeText = document.querySelector('.swipe-text');
    
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

        if (res.status === 429) {
            showConcurrentAlert();
            return;
        }

        const data = await res.json();

        if (data.success) {
            handle.innerHTML = '<i class="bi bi-check-lg"></i>';
            handle.style.background = '#10b981'; 
            
            if (swipeText) {
                swipeText.innerText = t('vote_success_msg', 'SUARA BERHASIL DIKIRIM!');
                swipeText.style.opacity = "1";
            }

            sessionStorage.setItem('lastVoteTx', data.txHash);
            sessionStorage.setItem('lastVoteTime', new Date().toISOString());
            sessionStorage.setItem('voterAddress', data.nikHash);
            sessionStorage.setItem('isNewVote', 'true'); 
            sessionStorage.setItem('votingCompleted', 'true');
            localStorage.setItem('hasVoted', 'true');

            window.history.replaceState(null, null, '../dashboard/dashboard.html');

            setTimeout(() => {
                document.getElementById('voteStateConfirm').style.display = 'none';
                document.getElementById('voteStateSuccess').style.display = 'block';
                startRedirectCountdown(5);
            }, 1000);

        } else {
            if (data.isDoubleVote) {
                showErrorVoteModal(t('err_nik_already_voted', data.error), true, data.txHash);
            } else {
                const localizedError = t(data.errorKey, data.error || "Pilihan Anda ditolak oleh sistem.");
                showErrorVoteModal(localizedError, false, null);
            }
            resetSwipe();
        }

    } catch (e) {
        console.error("Koneksi gagal:", e);
        showNetworkErrorModal();
        resetSwipe();
    }
}

function showConcurrentAlert(customMessage) {
    const voteModalEl = document.getElementById('confirmVoteModal');
    if (voteModalEl) {
        const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
        if (voteModalInstance) voteModalInstance.hide();
    }

    if (customMessage) {
        document.getElementById('concurrentMessage').innerText = customMessage;
    }

    const concurrentModal = new bootstrap.Modal(document.getElementById('concurrentModal'));
    concurrentModal.show();

    let timeLeft = 5;
    const countdownEl = document.getElementById('concurrentCountdown');

    const timer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            clearAndExit();
        }
    }, 1000);
}

/**
 * Menampilkan Modal Error dengan Tombol Dinamis ke Tx Hash Etherscan
 */
function showErrorVoteModal(message, isDoubleVote, txHash) {
    const voteModalEl = document.getElementById('confirmVoteModal');
    if (voteModalEl) {
        const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
        if (voteModalInstance) voteModalInstance.hide();
    }

    document.getElementById('errorVoteMessage').innerText = message;
    const btnEtherscan = document.getElementById('btnErrorEtherscan');

    if (isDoubleVote) {
        btnEtherscan.style.setProperty('display', 'inline-flex', 'important');
        
        if (txHash) {
            btnEtherscan.classList.remove('disabled');
            btnEtherscan.style.pointerEvents = 'auto';
            btnEtherscan.innerHTML = `<i class="bi bi-box-arrow-up-right"></i> ${t('btn_check_etherscan', 'Periksa Audit di Etherscan')}`;
            btnEtherscan.setAttribute('href', `https://sepolia.etherscan.io/tx/${txHash}`);
        } else {
            btnEtherscan.classList.add('disabled');
            btnEtherscan.style.pointerEvents = 'none';
            btnEtherscan.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${t('connecting_blockchain', 'Menghubungkan ke Blockchain...')}`;
            btnEtherscan.setAttribute('href', '#');
        }
    } else {
        btnEtherscan.style.setProperty('display', 'none', 'important');
    }

    const errorModal = new bootstrap.Modal(document.getElementById('errorVoteModal'));
    errorModal.show();

    let timeLeft = 5;
    const countdownEl = document.getElementById('errorCountdown');
    if (countdownEl) countdownEl.innerText = timeLeft;
    
    if (window.errorTimer) clearInterval(window.errorTimer);
    
    window.errorTimer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(window.errorTimer);
            clearAndExit(); 
        }
    }, 1000);
}

function showNetworkErrorModal() {
    const voteModalEl = document.getElementById('confirmVoteModal');
    if (voteModalEl) {
        const voteModalInstance = bootstrap.Modal.getInstance(voteModalEl);
        if (voteModalInstance) voteModalInstance.hide();
    }

    const netModal = new bootstrap.Modal(document.getElementById('networkErrorModal'));
    netModal.show();
}

function clearAndExit() {
    sessionStorage.clear();
    window.location.href = '../index.html';
}

function refreshPage() {
    document.body.style.opacity = '0.5';
    location.reload();
}

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

function initTheme() {
    const html = document.documentElement;
    const themeIcon = document.getElementById('theme-icon');
    if (!themeIcon) return;
    
    const syncIcon = (theme) => {
        if (theme === 'dark') {
            themeIcon.className = 'bi bi-moon-stars-fill';
        } else {
            themeIcon.className = 'bi bi-sun-fill';
        }
    };

    syncIcon(html.getAttribute('data-theme'));

    const themeToggleBtn = document.getElementById('theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            html.style.transition = 'background-color 0.5s ease, color 0.5s ease';
            
            localStorage.setItem('theme-preference', targetTheme);
            html.setAttribute('data-theme', targetTheme);
            syncIcon(targetTheme);
        });
    }
}

/**
 * Mengambil status voting dari backend
 */
async function checkVotingStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();

        const statusDot = document.getElementById('statusDot');
        const statusText = document.getElementById('statusText');
        const timerLabel = document.querySelector('.timer-label');
        const timerDisplay = document.getElementById('navTimerValue');
        const grid = document.getElementById('candidateGrid');
        const swipeTrack = document.getElementById('swipeTrack');

        if (countdownInterval) clearInterval(countdownInterval);

        if (data.status === 'active') {
            if(statusDot) statusDot.style.backgroundColor = '#10b981';
            if(statusText) statusText.innerText = t('status_ongoing', 'Berlangsung');
            if(timerLabel) timerLabel.innerText = `${t('timer_ends_in', 'BERAKHIR DALAM')}:`;
            
            if(grid) {
                grid.style.pointerEvents = 'auto';
                grid.style.opacity = '1';
            }

            if(swipeTrack) {
                swipeTrack.style.pointerEvents = 'auto';
                swipeTrack.style.opacity = '1';
            }

            runTimer(data.targetTime, timerDisplay, () => {
                if(statusDot) statusDot.style.backgroundColor = '#ef4444';
                if(statusText) statusText.innerText = t('status_ended', 'Selesai');
                if(timerLabel) timerLabel.innerText = `${t('status_time_up', 'WAKTU HABIS')}:`;
                if(timerDisplay) timerDisplay.innerText = "00:00:00";
                
                if(grid) {
                    grid.style.pointerEvents = 'none';
                    grid.style.opacity = '0.6';
                }

                if(swipeTrack) {
                    swipeTrack.style.pointerEvents = 'none';
                    swipeTrack.style.opacity = '0.5';
                    const swipeText = document.querySelector('.swipe-text');
                    if(swipeText) swipeText.innerText = t('status_closed', 'VOTING CLOSED');
                }
            });

        } else if (data.status === 'upcoming') {
            if(statusDot) statusDot.style.backgroundColor = '#f59e0b';
            if(statusText) statusText.innerText = t('status_not_started', 'Menunggu');
            if(timerLabel) timerLabel.innerText = t('status_not_started', 'BELUM DIMULAI');
            if(timerDisplay) timerDisplay.innerText = "--:--:--";
            
            if(grid) {
                grid.style.pointerEvents = 'none';
                grid.style.opacity = '0.6';
            }

            if(swipeTrack) {
                swipeTrack.style.pointerEvents = 'none';
                swipeTrack.style.opacity = '0.6';
                const swipeText = document.querySelector('.swipe-text');
                if(swipeText) swipeText.innerText = t('status_not_started', 'VOTING BELUM DIMULAI');
            }

        } else {
            if(statusDot) statusDot.style.backgroundColor = '#ef4444';
            if(statusText) statusText.innerText = t('status_ended', 'Selesai');
            if(timerLabel) timerLabel.innerText = t('status_ended', 'VOTING SELESAI');
            
            if(grid) {
                grid.style.pointerEvents = 'none';
                grid.style.opacity = '0.6';
            }

            if(swipeTrack) {
                swipeTrack.style.pointerEvents = 'none';
                swipeTrack.style.opacity = '0.6';
                const swipeText = document.querySelector('.swipe-text');
                if(swipeText) swipeText.innerText = t('status_closed', 'VOTING SELESAI');
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
            if(displayElement) displayElement.innerText = "00:00:00";
            if (onFinish) onFinish();
            return;
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if(displayElement) {
            displayElement.innerText = 
                `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }

    update();
    countdownInterval = setInterval(update, 1000);
}