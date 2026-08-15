const BACKEND_URL = 'https://6c09-172-216-170-152.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let countdownInterval = null;
let receiptModalInstance = null;
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
        renderStats(allCandidatesData);
    }
    initSmartStatus();
    checkVotingStatus();
    fillReceiptData();
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
document.addEventListener('DOMContentLoaded', async () => {
    if (sessionStorage.getItem('isRechecking') === 'true') {
        await reSyncVoteStatus();
        sessionStorage.removeItem('isRechecking');
    }

    initTheme();
    await updateContent(currentLang);
    fetchResults(); // Ambil data awal saat pertama kali buka
    setupRealtimeUpdate();
    checkNewVoteReceipt();
});

async function reSyncVoteStatus() {
    const nik = sessionStorage.getItem('voterNIK');
    if (!nik) return;

    try {
        const res = await fetch(`${BACKEND_URL}/check-vote-status/${nik}`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();

        if (data.status === 'confirmed' && data.txHash) {
            sessionStorage.setItem('lastVoteTx', data.txHash);
            sessionStorage.setItem('voterAddress', data.nikHash);
            sessionStorage.setItem('lastVoteTime', data.timestamp); 
            console.log("✅ Data transaksi & waktu disinkronkan.");
        }
    } catch (err) {
        console.error("Gagal sinkronisasi:", err);
    }
}

// --- 3. Setup Real-time Update (Native SSE) ---
function setupRealtimeUpdate() {
    const eventSource = new EventSource(`${BACKEND_URL}/results-stream`);

    eventSource.onmessage = (event) => {
        try {
            const updatedData = JSON.parse(event.data);
            console.log("⚡ Update suara masuk!");
            allCandidatesData = updatedData;
            renderStats(updatedData);
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
            headers: NGROK_HEADERS
        });
        if (!res.ok) throw new Error('Gagal mengambil data dari server');
        const data = await res.json();
        if (data && Array.isArray(data)) {
            allCandidatesData = data;
            renderStats(data);
        }
    } catch (e) {
        console.error("Dashboard Error:", e);
        const chartContainer = document.getElementById('chartContainer');
        if (chartContainer) {
            chartContainer.innerHTML = `<div class="col-12 text-center py-5" style="animation: fadeIn 0.5s ease;">
                <div class="mb-4">
                    <i class="bi bi-cloud-slash display-1 text-muted"></i>
                </div>
                <h4 class="fw-bold">${t('net_error_title', 'Gagal Memuat Data Perolehan Suara')}</h4>
                <p class="text-secondary mb-4">${t('net_error_desc', 'Terjadi masalah koneksi ke server. Silakan coba muat ulang halaman.')}</p>
                
                <button onclick="location.reload()" class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm">
                    <i class="bi bi-arrow-clockwise me-2"></i> ${t('btn_try_again', 'Muat Ulang Halaman')}
                </button>
            </div>`;
        }
    }
}

// --- 5. Render Logic ---
function renderStats(candidates) {
    const totalVotes = candidates.reduce((sum, cand) => sum + (Number(cand.votes) || 0), 0);

    const totalElement = document.getElementById('totalVotes');
    if (totalElement) {
        const startVal = parseInt(totalElement.innerText.replace(/\./g, '')) || 0;
        animateValue("totalVotes", startVal, totalVotes, 1000);
    }

    const chartContainer = document.getElementById('chartContainer');
    const cardsContainer = document.getElementById('candidateCards');
    const syncText = document.getElementById('lastUpdateText');

    if (syncText) {
        const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
        const labelPrefix = currentLang === 'en' ? 'Last Update:' : 'Terakhir diperbarui:';
        syncText.innerText = `${labelPrefix} ${new Date().toLocaleTimeString(timeLocale)}`;
        
        const badge = syncText.closest('.sync-badge');
        if (badge) {
            badge.style.backgroundColor = "rgba(16, 185, 129, 0.2)";
            badge.style.transform = "scale(1.05)";
            
            setTimeout(() => {
                badge.style.backgroundColor = "";
                badge.style.transform = "";
            }, 600);
        }
    }

    let chartHTML = '';
    let cardsHTML = '';

    const candidatePrefix = currentLang === 'en' ? 'Candidate No.' : 'Kandidat No.';
    const votesSuffix = currentLang === 'en' ? 'Votes' : 'Suara';

    candidates.forEach(cand => {
        const votes = Number(cand.votes) || 0;
        const percentage = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : 0;
        const barColor = cand.warna || '#2563eb';

        chartHTML += `
            <div class="vote-bar-wrapper animate-fade-in">
                <div class="progress-label">
                    <span class="text-truncate" style="max-width: 70%">${candidatePrefix} ${cand.noUrut}</span>
                    <span class="text-accent fw-bold">${percentage}% <small class="text-muted fw-normal">(${votes} ${votesSuffix})</small></span>
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
                        <small class="text-muted">${candidatePrefix} ${cand.noUrut}</small>
                        <div class="mt-1">
                             <span class="badge rounded-pill" style="background-color: ${barColor}22; color: ${barColor};">
                                 ${votes} ${votesSuffix}
                             </span>
                        </div>
                    </div>
                </div>
            </div>`;
    });

    if (chartContainer) chartContainer.innerHTML = chartHTML;
    if (cardsContainer) cardsContainer.innerHTML = cardsHTML;
}

// --- 6. UI Helpers ---
function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj || start === end) return;
    const range = end - start;
    let current = start;
    const increment = end > start ? 1 : -1;
    const stepTime = Math.abs(Math.floor(duration / (range || 1)));
    const locale = currentLang === 'en' ? 'en-US' : 'id-ID';
    const timer = setInterval(function () {
        current += increment;
        obj.innerText = current.toLocaleString(locale);
        if (current == end) clearInterval(timer);
    }, stepTime || 10);
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

    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const targetTheme = currentTheme === 'dark' ? 'light' : 'dark';

            html.style.transition = 'background-color 0.5s ease, color 0.5s ease';

            localStorage.setItem('theme-preference', targetTheme);
            html.setAttribute('data-theme', targetTheme);
            syncIcon(targetTheme);
        });
    }
}

function logout() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    Swal.fire({
        title: t('logout_confirm_title', 'Konfirmasi Keluar'),
        html: t('logout_confirm_msg', 'Demi keamanan, keluar dari halaman ini akan mengakhiri sesi Anda. Anda memerlukan QR Code dan NIK Anda kembali untuk mengakses dashboard ini di lain waktu.'),
        icon: 'warning',
        iconColor: '#ef4444',
        showCancelButton: true,
        confirmButtonText: t('btn_yes_logout', 'Ya, Keluar'),
        cancelButtonText: t('btn_cancel', 'Batal'),

        customClass: {
            popup: 'swal2-popup-custom',
            title: 'swal2-title-custom',
            htmlContainer: 'swal2-html-custom',
            actions: 'swal2-actions',
            confirmButton: 'swal2-confirm-custom btn btn-danger shadow-sm',
            cancelButton: 'swal2-cancel-custom btn btn-light border shadow-sm'
        },

        background: isDark ? '#0f172a' : '#ffffff',
        buttonsStyling: false,
        reverseButtons: true
    }).then((result) => {
        if (result.isConfirmed) {
            sessionStorage.clear();
            window.location.href = '../index.html';
        }
    });
}

/**
 * Logika Sinkronisasi Waktu
 */
async function checkVotingStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();

        const timerLabel = document.getElementById('timerLabel');
        const timerDisplay = document.getElementById('navTimerValue');
        const statusPulse = document.getElementById('statusPulse');

        if (countdownInterval) clearInterval(countdownInterval);

        if (data.status === 'active') {
            if (statusPulse) {
                statusPulse.style.backgroundColor = '#10b981';
                statusPulse.style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.7)';
            }
            if (timerLabel) timerLabel.innerText = t('timer_ends_in', 'BERAKHIR DALAM');

            runTimer(data.targetTime, timerDisplay, () => {
                if (statusPulse) {
                    statusPulse.style.backgroundColor = '#ef4444';
                    statusPulse.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.7)';
                }
                if (timerLabel) timerLabel.innerText = t('status_time_up', 'WAKTU HABIS');
                if (timerDisplay) timerDisplay.innerText = "00:00:00";
            });

        } else if (data.status === 'upcoming') {
            if (statusPulse) {
                statusPulse.style.backgroundColor = '#f59e0b';
                statusPulse.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.7)';
            }
            if (timerLabel) timerLabel.innerText = t('status_not_started', 'BELUM DIMULAI');
            if (timerDisplay) timerDisplay.innerText = "--:--:--";

        } else {
            if (statusPulse) {
                statusPulse.style.backgroundColor = '#ef4444';
                statusPulse.style.boxShadow = '0 0 10px rgba(239, 68, 68, 0.7)';
            }
            if (timerLabel) timerLabel.innerText = t('voting_status', 'STATUS VOTING');
            if (timerDisplay) timerDisplay.innerText = t('status_ended', 'SELESAI');
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
            if (displayElement) displayElement.innerText = "00:00:00";
            if (onFinish) onFinish();
            return;
        }

        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const s = Math.floor((diff % (1000 * 60)) / 1000);

        if (displayElement) {
            displayElement.innerText =
                `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        }
    }

    update();
    countdownInterval = setInterval(update, 1000);
}

function initSmartStatus() {
    const statusArea = document.querySelector('.smart-status-area');
    const miniAddress = document.getElementById('miniAddress');
    const widgetLabel = document.getElementById('widgetLabel');
    const widgetIcon = document.getElementById('widgetIcon');
    const widgetIconContainer = document.getElementById('widgetIconContainer');
    const widgetBtnText = document.getElementById('widgetBtnText');
    const statusWidget = document.getElementById('statusWidget');

    const txHash = sessionStorage.getItem('lastVoteTx');
    const userAddress = sessionStorage.getItem('voterAddress');

    if (sessionStorage.getItem('voterNIK')) {
        if (statusArea) statusArea.style.display = 'block';

        if (txHash && txHash !== "undefined") {
            if (widgetLabel) {
                widgetLabel.innerText = t('widget_label_verified', 'VERIFIKASI ON-CHAIN');
                widgetLabel.style.color = "#10b981";
            }
            
            if (widgetIcon) widgetIcon.className = "bi bi-patch-check-fill";
            if (widgetIconContainer) widgetIconContainer.style.color = "#10b981";
            
            if (widgetBtnText) widgetBtnText.innerText = t('widget_btn_view', 'Lihat Suara');
            
            if (userAddress && miniAddress) {
                const shortAddr = `${userAddress.substring(0, 6)}...${userAddress.substring(userAddress.length - 4)}`;
                miniAddress.innerText = shortAddr;
            }
            
            if (statusWidget) statusWidget.classList.remove('widget-pending');

        } else {
            if (widgetLabel) {
                widgetLabel.innerText = t('widget_label_processing', 'SEDANG DIPROSES...');
                widgetLabel.style.color = "#f59e0b";
            }
            
            if (widgetIcon) widgetIcon.className = "bi bi-hourglass-split anim-hourglass";
            if (widgetIconContainer) widgetIconContainer.style.color = "#f59e0b";
            
            if (widgetBtnText) widgetBtnText.innerText = t('widget_btn_check', 'Cek Status');
            if (miniAddress) miniAddress.innerText = t('status_processing', 'Memproses...');
            
            if (statusWidget) statusWidget.classList.add('widget-pending');
        }
    } else {
        if (statusArea) statusArea.style.display = 'none';
    }
}

function shortenHash(hash, start = 8, end = 6) {
    if (!hash || hash.length < 15) return hash;
    return `${hash.substring(0, start)}...${hash.substring(hash.length - end)}`;
}

function copyText(elementId, event) {
    const el = document.getElementById(elementId);
    const btn = event.currentTarget; 
    const txHash = sessionStorage.getItem('lastVoteTx');

    if (elementId === 'receiptTxHash' && (!txHash || txHash === "undefined")) {
        console.warn("Percobaan salin gagal: Tx Hash belum tersedia.");
        return; 
    }

    const textToCopy = el ? (el.getAttribute('data-full-hash') || el.innerText) : '';

    if (!textToCopy || textToCopy.includes('Menunggu') || textToCopy.includes('0x...') || textToCopy.includes('Memproses')) {
        return;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
        showCopyToast(t('copy_success', 'Berhasil disalin'));

        const originalHTML = btn.innerHTML;
        
        if (btn.classList.contains('btn-copy-premium')) {
            btn.innerHTML = `<i class="bi bi-check2-all text-success"></i> <span class="text-success">${t('copied_status', 'Tersalin')}</span>`;
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

function showCopyToast(message = t('copy_success', 'Berhasil disalin'), iconClass = "bi-check-circle-fill", iconColor = "#10b981") {
    const toast = document.getElementById('copyToast');
    const toastText = document.getElementById('toastText');
    const toastIcon = document.getElementById('toastIcon');

    if (toastText) toastText.innerText = message;
    if (toastIcon) {
        toastIcon.className = `bi ${iconClass} me-2`;
        toastIcon.style.color = iconColor;
    }

    if (toast) toast.classList.add('show');

    setTimeout(() => {
        if (toast) toast.classList.remove('show');
    }, 2000);
}

function showReceiptModal() {
    const txHash = sessionStorage.getItem('lastVoteTx');
    const statusArea = document.querySelector('.glass-widget');

    if (!txHash) {
        Swal.fire({
            title: `<span class="swal-title-custom">${t('data_not_found_title', 'Data Tidak Ditemukan')}</span>`,
            html: `
                <div class="swal-content-custom">
                    <div class="empty-data-icon">
                        <i class="bi bi-search-heart"></i>
                    </div>
                    <p class="mt-3 text-muted">${t('data_not_found_desc', 'Bukti suara digital tidak tersedia atau sesi Anda telah berakhir.')}</p>
                </div>
            `,
            showConfirmButton: true,
            confirmButtonText: t('btn_understand', 'Mengerti'),
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
                window.location.reload();
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
        if (statusArea) statusArea.style.opacity = '0.7';
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (statusArea) statusArea.style.opacity = '1';
        }, { once: true });
    }
}

function fillReceiptData() {
    const txHash = sessionStorage.getItem('lastVoteTx');
    const nik = sessionStorage.getItem('voterNIK');
    const time = sessionStorage.getItem('lastVoteTime');
    const userAddress = sessionStorage.getItem('voterAddress');

    const addrEl = document.getElementById('receiptAddress');
    const hashEl = document.getElementById('receiptTxHash');
    const statusBadge = document.getElementById('receiptStatus');
    const explorerBtn = document.getElementById('receiptExplorer');
    
    const copyBtnAddr = document.querySelector('[onclick="copyText(\'receiptAddress\', event)"]');
    const copyBtnHash = document.querySelector('[onclick="copyText(\'receiptTxHash\', event)"]');

    const headerTitle = document.getElementById('headerTitle');
    const headerSubTitle = document.getElementById('headerSubTitle');
    const headerIcon = document.getElementById('headerIcon');
    const headerCircle = document.getElementById('headerIconCircle');
    const receiptNIK = document.getElementById('receiptNIK');
    const receiptTime = document.getElementById('receiptTime');

    if (nik && receiptNIK) receiptNIK.innerText = nik.substring(0, 4) + "••••" + nik.substring(12);
    
    // --- OPSI WAKTU ---
    if (time && time !== "undefined" && time !== "null") {
        const timestamp = Number(time); 
        const dateObj = new Date(timestamp); 
        const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';

        if (!isNaN(dateObj.getTime()) && receiptTime) {
            receiptTime.innerText = dateObj.toLocaleString(timeLocale, {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } else if (receiptTime) {
            receiptTime.innerText = t('time_now', 'Sekarang');
        }
    } else if (receiptTime) {
        receiptTime.innerText = t('time_now', 'Sekarang');
    }

    // --- JIKA SUDAH ADA TX HASH (SUKSES) ---
    if (txHash && txHash !== "undefined" && txHash !== "null") {
        if (userAddress && addrEl) {
            addrEl.innerText = shortenHash(userAddress, 6, 4);
            addrEl.setAttribute('data-full-hash', userAddress);
            if (copyBtnAddr) {
                copyBtnAddr.classList.remove('disabled-btn');
                copyBtnAddr.style.opacity = "1";
                copyBtnAddr.style.pointerEvents = "auto";
            }
        }

        if (hashEl) {
            hashEl.innerText = shortenHash(txHash, 8, 6);
            hashEl.setAttribute('data-full-hash', txHash);
            if (copyBtnHash) {
                copyBtnHash.classList.remove('disabled-btn');
                copyBtnHash.style.opacity = "1";
                copyBtnHash.style.pointerEvents = "auto";
            }
        }

        if (headerTitle) headerTitle.innerText = t('receipt_header_title', 'Suara Diterima!');
        if (headerSubTitle) headerSubTitle.innerText = t('receipt_header_subtitle', 'Transaksi berhasil diverifikasi');
        if (headerIcon) headerIcon.innerText = "verified_user";
        
        if (headerCircle) {
            headerCircle.style.background = "linear-gradient(135deg, #10b981, #059669)";
            headerCircle.style.boxShadow = "0 0 20px rgba(16, 185, 129, 0.5)";
        }

        if (explorerBtn) {
            explorerBtn.classList.remove('disabled');
            explorerBtn.style.pointerEvents = "auto";
            explorerBtn.style.opacity = "1";
            explorerBtn.href = `https://sepolia.etherscan.io/tx/${txHash}`;
        }
        
        updateStatusToSuccess(statusBadge);

    } 
    // --- JIKA MASIH PENDING (MEMPROSES) ---
    else {
        const processingText = t('status_processing', 'Memproses...');

        if (addrEl) addrEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" style="width: 10px; height: 10px;"></span> ${processingText}`;
        if (copyBtnAddr) {
            copyBtnAddr.classList.add('disabled-btn');
            copyBtnAddr.style.opacity = "0.3";
            copyBtnAddr.style.pointerEvents = "none";
        }

        if (hashEl) hashEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" style="width: 10px; height: 10px;"></span> ${processingText}`;
        if (copyBtnHash) {
            copyBtnHash.classList.add('disabled-btn');
            copyBtnHash.style.opacity = "0.3";
            copyBtnHash.style.pointerEvents = "none";
        }

        if (statusBadge) {
            statusBadge.innerHTML = `
                <i class="bi bi-hourglass-split me-1 anim-hourglass"></i> 
                ${t('status_pending', 'Pending')}
            `;
            statusBadge.className = "badge-status-receipt pending";
        }

        if (headerTitle) headerTitle.innerText = t('receipt_header_pending_title', 'Suara Diverifikasi...');
        if (headerSubTitle) headerSubTitle.innerText = t('receipt_header_pending_subtitle', 'Sedang memverifikasi suara Anda ke Blockchain');
        if (headerIcon) headerIcon.innerText = "hourglass_empty";
        
        if (headerCircle) {
            headerCircle.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
            headerCircle.style.boxShadow = "0 0 20px rgba(245, 158, 11, 0.4)";
        }

        if (explorerBtn) {
            explorerBtn.classList.add('disabled');
            explorerBtn.style.pointerEvents = "none";
            explorerBtn.style.opacity = "0.5";
        }

        startPollingStatus();
    }
}

let pollInterval = null;
function startPollingStatus() {
    if (pollInterval) return;

    const nik = sessionStorage.getItem('voterNIK');
    if (!nik) return;

    pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/check-vote-status/${nik}`, {
                headers: NGROK_HEADERS
            });
            const data = await res.json();

            if (data.status === 'confirmed') {
                sessionStorage.setItem('lastVoteTx', data.txHash);
                sessionStorage.setItem('voterAddress', data.nikHash);
                sessionStorage.setItem('lastVoteTime', data.timestamp);
                
                clearInterval(pollInterval);
                pollInterval = null;

                fillReceiptData();
                initSmartStatus();
                showCopyToast(t('receipt_header_title', 'Suara Diterima'), "bi-shield-check", "#10b981");
            }
        } catch (err) {
            console.error("Polling error:", err);
        }
    }, 4000);
}

function checkNewVoteReceipt() {
    if (sessionStorage.getItem('isNewVote') === 'true') {
        showReceiptModal();
        sessionStorage.removeItem('isNewVote');
    }
}

function updateStatusToSuccess(element) {
    if (element) {
        element.style.opacity = '0';
        
        setTimeout(() => {
            element.classList.remove('pending');
            element.classList.add('success');
            
            element.innerHTML = `
                <i class="bi bi-check-circle-fill me-1 animate-pop"></i> 
                ${t('status_confirmed', 'Terkonfirmasi')}
            `;
            
            element.style.opacity = '1';
        }, 200);
    }
}

function refreshPage() {
    document.body.style.opacity = '0.5';
    location.reload();
}