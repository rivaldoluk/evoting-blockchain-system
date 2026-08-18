/**
 * KONFIGURASI GLOBAL
 */
const BACKEND_URL = 'https://e5a8-103-129-24-168.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let provider, signer, adminAddress;
let eventSource;
let AUTHORIZED_ADMIN = "";
let TOTAL_DPT = 0;

// === SISTEM MULTI-BAHASA (i18n) KHUSUS ADMIN ===
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

    // 1. Update elemen ber-atribut data-i18n
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        if (translations[key]) {
            element.innerHTML = translations[key];
        }
    });

    // 2. Update placeholder input pencarian
    const voterSearchInput = document.getElementById('voterSearchInput');
    if (voterSearchInput && translations['search_voter_placeholder']) {
        voterSearchInput.placeholder = translations['search_voter_placeholder'];
    }

    // 3. Simpan preferensi bahasa
    localStorage.setItem('preferredLang', lang);
    document.documentElement.lang = lang;

    // 4. Toggle kelas tombol aktif (ID / EN)
    const btnId = document.getElementById('btn-lang-id');
    const btnEn = document.getElementById('btn-lang-en');
    if (btnId && btnEn) {
        btnId.classList.toggle('active', lang === 'id');
        btnEn.classList.toggle('active', lang === 'en');
    }

    // 5. Refresh elemen UI dinamis yang sedang tampil & RENDER ULANG LOGS
    refreshDashboardStatus();
    if (allCandidatesData.length > 0) {
        updateDashboardUI(allCandidatesData);
    }
    renderTransactionTableRows();
    checkMetaMaskAvailability();
    renderLogs(); // <--- PERBAIKAN: Render ulang log saat bahasa berganti
}

function changeLanguage(lang) {
    currentLang = lang;
    updateContent(lang);
}

// State untuk Tabel & Pagination
let allVoters = [];
let filteredVoters = [];
let votedVotersOnly = []; 
let currentPage = 1;      // Pagination Modal DPT
let txCurrentPage = 1;    // Pagination Tabel Utama
const rowsPerPage = 10;
let allCandidatesData = []; 

function getFullImageUrl(path) {
    if (!path) return '/img/default.png';
    if (path.startsWith('http')) return path;
    const fileName = path.split('/').pop();
    return `/img/${fileName}`;
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Inisialisasi Tema
    themeHandler.init();

    // 2. Muat Bahasa & Terjemahan
    await updateContent(currentLang);

    // 3. Cek ketersediaan MetaMask (Visual Indikator)
    checkMetaMaskAvailability();

    // 4. Jalankan Jam Login
    setInterval(updateLoginClock, 1000);
    updateLoginClock();

    // 5. Cek Sesi Login
    checkSession();

    // 6. Pasang Event Listeners
    initEventListeners();
});

/**
 * 1. THEME MANAGEMENT SYSTEM
 */
const themeHandler = {
    init: () => {
        const storedTheme = localStorage.getItem('theme') || 'auto';
        themeHandler.setTheme(storedTheme);

        document.querySelectorAll('[data-bs-theme-value]').forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.getAttribute('data-bs-theme-value');
                localStorage.setItem('theme', theme);
                themeHandler.setTheme(theme);
            });
        });

        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
            if (localStorage.getItem('theme') === 'auto') {
                themeHandler.setTheme('auto');
            }
        });
    },

    setTheme: (theme) => {
        const root = document.documentElement;
        if (theme === 'auto') {
            const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            root.setAttribute('data-theme', isDark ? 'dark' : 'light');
        } else {
            root.setAttribute('data-theme', theme);
        }
        themeHandler.updateActiveUI(theme);
    },

    updateActiveUI: (theme) => {
        const icon = document.querySelector('#bd-theme i');
        if (!icon) return;

        const icons = {
            light: 'bi-sun-fill',
            dark: 'bi-moon-stars-fill',
            auto: 'bi-circle-half'
        };
        icon.className = `bi ${icons[theme]}`;

        document.querySelectorAll('[data-bs-theme-value]').forEach(el => {
            el.classList.toggle('active', el.getAttribute('data-bs-theme-value') === theme);
        });
    }
};

/**
 * 2. AUTHENTICATION & SESSION
 */
function initEventListeners() {
    const btnConnect = document.getElementById('btnConnectMetamask');
    const logoutBtnSidebar = document.getElementById('btnLogoutSidebar');
    const logoutBtnNavbar = document.getElementById('btnLogout');

    if (btnConnect) btnConnect.addEventListener('click', connectWallet);
    if (logoutBtnSidebar) logoutBtnSidebar.onclick = (e) => { e.preventDefault(); confirmLogout(); };
    if (logoutBtnNavbar) logoutBtnNavbar.onclick = (e) => { e.preventDefault(); confirmLogout(); };

    const btnStart = document.getElementById('btnStartVoting');
    if (btnStart) {
        btnStart.onclick = () => startVotingProcess();
    }
    
    const btnPemilih = document.getElementById('menuDataPemilih');
    if (btnPemilih) {
        btnPemilih.onclick = (e) => {
            e.preventDefault();
            showVoterData();
        };
    }

    const prevPageBtn = document.getElementById('prevPage');
    if (prevPageBtn) {
        prevPageBtn.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderVoterTable();
            }
        });
    }

    const nextPageBtn = document.getElementById('nextPage');
    if (nextPageBtn) {
        nextPageBtn.addEventListener('click', () => {
            if ((currentPage * rowsPerPage) < filteredVoters.length) {
                currentPage++;
                renderVoterTable();
            }
        });
    }

    const searchInput = document.getElementById('voterSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase();
            filteredVoters = allVoters.filter(voter =>
                voter.nikHash.toLowerCase().includes(keyword)
            );
            currentPage = 1;
            renderVoterTable();
        });
    }

    const btnPrevTx = document.getElementById('prevTxPage');
    const btnNextTx = document.getElementById('nextTxPage');

    if (btnPrevTx) {
        btnPrevTx.onclick = () => {
            if (txCurrentPage > 1) {
                txCurrentPage--;
                renderTransactionTableRows();
            }
        };
    }

    if (btnNextTx) {
        btnNextTx.onclick = () => {
            if ((txCurrentPage * 10) < votedVotersOnly.length) {
                txCurrentPage++;
                renderTransactionTableRows();
            }
        };
    }

    const menuKandidat = document.getElementById('menuKandidat');
    if (menuKandidat) {
        menuKandidat.onclick = (e) => { e.preventDefault(); showKandidatData(); };
    }
}

async function checkSession() {
    try {
        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
            headers: NGROK_HEADERS
        });
        const configData = await configRes.json();

        AUTHORIZED_ADMIN = configData.authorizedAdmin.toLowerCase();
        TOTAL_DPT = configData.totalDPT;

        const isAuth = sessionStorage.getItem('adminAuth');
        
        if (isAuth === 'true' && window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.listAccounts();
            
            const currentAddress = accounts.length > 0 ? accounts[0].address.toLowerCase() : null;
            const savedAddress = sessionStorage.getItem('adminAddress')?.toLowerCase();

            if (currentAddress && currentAddress === savedAddress && currentAddress === AUTHORIZED_ADMIN) {
                signer = await provider.getSigner();
                showDashboard(savedAddress);
            } else {
                executeLogout(); 
            }
        } else if (isAuth === 'true' && !window.ethereum) {
            executeLogout();
        }

    } catch (err) {
        console.error("Gagal load config atau validasi sesi:", err);
    }
}

async function connectWallet() {
    const btnConnect = document.getElementById('btnConnectMetamask');
    const status = document.getElementById('loginStatus');
    
    if (status) {
        status.className = "mt-3 small text-primary";
        status.innerText = t('status_connecting_server', 'Menghubungkan ke server...');
    }

    btnConnect.disabled = true;
    const originalText = btnConnect.innerHTML;
    btnConnect.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('btn_connecting', 'Menghubungkan...')}`;

    try {
        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
            headers: NGROK_HEADERS
        });
        if (!configRes.ok) throw new Error(t('err_config_fetch', 'Gagal mengambil konfigurasi server.'));
        const configData = await configRes.json();
        AUTHORIZED_ADMIN = configData.authorizedAdmin.toLowerCase();

        if (typeof window.ethereum === 'undefined') {
            throw new Error(t('err_refresh_page', 'Setelah instalasi selesai, silakan refresh halaman ini.'));
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        adminAddress = (await signer.getAddress()).toLowerCase();

        if (adminAddress !== AUTHORIZED_ADMIN) {
            if (status) {
                status.className = "mt-3 small text-danger";
                status.innerText = t('err_access_denied', 'Akses Ditolak: Anda bukan Admin.');
            }
            return;
        }

        if (status) status.innerText = t('sign_metamask_prompt', 'Silakan tanda tangani permintaan masuk di MetaMask...');
        const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
        const message = `Login Admin Panel\nTime: ${new Date().toLocaleString(timeLocale)}\nNonce: ${Math.floor(Math.random() * 1000000)}`;
        
        try {
            await signer.signMessage(message);
        } catch (signErr) {
            if (signErr.code === 'ACTION_REJECTED' || signErr.code === 4001) {
                throw new Error(t('err_sign_cancelled', 'Login dibatalkan: Tanda tangan diperlukan untuk akses ke dashboard.'));
            }
            throw signErr;
        }

        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminAddress', adminAddress);

        showDashboard(adminAddress);
        const shortAddr = `${adminAddress.substring(0, 6)}...${adminAddress.substring(adminAddress.length - 4)}`;
        addLog('log_admin_login_success', 'success', shortAddr);

    } catch (err) {
        console.error("Login Error:", err.code, err.message);
        
        if (status) {
            status.className = "mt-3 small text-danger";
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                status.innerText = t('err_account_not_available', 'Akun belum tersedia! Silahkan masuk menggunakan akun admin');
            } else {
                status.innerText = err.message || t('err_metamask_connect', 'Gagal menghubungkan MetaMask.');
            }
        }
    } finally {
        btnConnect.disabled = false;
        btnConnect.innerHTML = originalText;
    }
}

/**
 * 3. DASHBOARD CORE LOGIC
 */
function showDashboard(address) {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';

    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0 || accounts[0].toLowerCase() !== AUTHORIZED_ADMIN) {
                showAdminAuthModal();
            }
        });
        window.ethereum.on('chainChanged', () => window.location.reload());
    }

    const displayAddr = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    document.getElementById('adminWallet').innerText = displayAddr;

    renderLogs();
    startRealtimeStream();
    startCountdownTimer();
    startLiveTimeUpdates();
    refreshDashboardStatus();
}

function showAdminAuthModal() {
    const authModal = new bootstrap.Modal(document.getElementById('adminAuthModal'));
    authModal.show();

    let timeLeft = 5;
    const countdownEl = document.getElementById('adminCountdown');

    const timer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            executeLogout();
        }
    }, 1000);
}

async function startRealtimeStream() {
    try {
        const res = await fetch(`${BACKEND_URL}/results`, { 
            headers: NGROK_HEADERS 
        });
        if (res.ok) {
            const initialData = await res.json();
            allCandidatesData = initialData;
            updateDashboardUI(initialData);
            
            const configRes = await fetch(`${BACKEND_URL}/admin/config`, { headers: NGROK_HEADERS });
            if (configRes.ok) {
                const configData = await configRes.json();
                updateTransactionTable(configData.votersList);
            }
        }
    } catch (err) {
        console.error("Gagal mengambil data awal via fetch:", err);
    }

    if (eventSource) eventSource.close();
    
    eventSource = new EventSource(`${BACKEND_URL}/results-stream`);

    eventSource.onmessage = async (event) => {
        try {
            const candidates = JSON.parse(event.data);
            allCandidatesData = candidates;
            updateDashboardUI(candidates);
            
            const configRes = await fetch(`${BACKEND_URL}/admin/config`, { 
                headers: NGROK_HEADERS 
            });
            if (configRes.ok) {
                const configData = await configRes.json();
                updateTransactionTable(configData.votersList);
            }
            
            addLog('log_blockchain_sync', 'info');
        } catch (e) {
            console.error("Gagal sinkronisasi via stream:", e);
        }
    };

    eventSource.onerror = (err) => {
        console.warn("Koneksi Stream terputus. Mencoba menyambung kembali...");
    };
}

function updateDashboardUI(candidates) {
    if (!candidates || !Array.isArray(candidates)) return;

    const totalVotes = candidates.reduce((sum, c) => sum + (Number(c.votes) || 0), 0);
    const participation = TOTAL_DPT > 0 ? ((totalVotes / TOTAL_DPT) * 100).toFixed(1) : 0;
    const locale = currentLang === 'en' ? 'en-US' : 'id-ID';

    const elTotalVotes = document.getElementById('statTotalVotes');
    const elTotalVoters = document.getElementById('statTotalVoters');
    const elParticipation = document.getElementById('statParticipation');

    if (elTotalVotes) elTotalVotes.innerText = totalVotes.toLocaleString(locale);
    if (elTotalVoters) elTotalVoters.innerText = TOTAL_DPT.toLocaleString(locale);
    if (elParticipation) elParticipation.innerText = participation + "%";

    const voteBar = document.getElementById('voteProgress');
    const particBar = document.getElementById('particProgress');
    const dptBar = document.getElementById('dptProgress');

    if (voteBar) voteBar.style.width = Math.min(participation, 100) + "%";
    if (particBar) particBar.style.width = Math.min(participation, 100) + "%";
    if (dptBar) dptBar.style.width = "100%";

    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;

    const sorted = [...candidates].sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));
    const candidatePrefix = currentLang === 'en' ? 'Candidate No.' : 'Kandidat No.';
    const votesSuffix = currentLang === 'en' ? 'Votes' : 'Suara';

    tbody.innerHTML = sorted.map((cand, index) => {
        const votes = Number(cand.votes) || 0;
        const pct = totalVotes > 0 ? ((votes / totalVotes) * 100).toFixed(1) : "0.0";
        
        return `
            <tr>
                <td class="ps-4 text-muted mono">#${index + 1}</td>
                <td>
                    <div class="d-flex align-items-center">
                        <img src="${getFullImageUrl(cand.foto)}" class="rounded-circle me-3 border border-secondary" width="40" height="40" style="object-fit: cover;" onerror="this.src='/img/default.png'">
                        <div>
                            <div class="fw-bold">${cand.nama}</div>
                            <div class="small text-muted">${candidatePrefix} ${cand.noUrut}</div>
                        </div>
                    </div>
                </td>
                <td style="width: 35%">
                    <div class="d-flex align-items-center gap-2">
                        <div class="progress flex-grow-1" style="height: 6px; background: var(--border)">
                            <div class="progress-bar" style="width: ${pct}%; background: ${cand.warna || 'var(--accent-blue)'}"></div>
                        </div>
                        <span class="small fw-bold mono">${pct}%</span>
                    </div>
                </td>
                <td class="text-end pe-4">
                    <span class="badge bg-dark border border-secondary px-3 py-2 mono">${votes} ${votesSuffix}</span>
                </td>
            </tr>
        `;
    }).join('');
}

function updateTransactionTable(votersList) {
    votedVotersOnly = votersList
        .filter(v => v.voted && v.timestamp) 
        .sort((a, b) => b.timestamp - a.timestamp);

    renderTransactionTableRows();
}

function renderTransactionTableRows() {
    const tbody = document.getElementById('transactionTableBody');
    const txNav = document.getElementById('txPaginationNav');
    const syncText = document.getElementById('lastUpdateText');
    const btnPrevTx = document.getElementById('prevTxPage');
    const btnNextTx = document.getElementById('nextTxPage');
    
    if (!tbody) return;

    // 1. Selalu perbarui jam/status sinkronisasi terlepas dari ada/tidaknya transaksi
    const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
    const labelPrefix = t('last_update_label', currentLang === 'en' ? 'Last Update:' : 'Terakhir diperbarui:');
    
    if (syncText) {
        if (votedVotersOnly.length === 0) {
            syncText.innerText = t('last_update_text', currentLang === 'en' ? 'Last Update: Just now' : 'Terakhir diperbarui: Baru saja');
        } else {
            syncText.innerText = `${labelPrefix} ${new Date().toLocaleTimeString(timeLocale)}`;
        }
    }

    if (votedVotersOnly.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-muted" data-i18n="waiting_tx">${t('waiting_tx', 'Menunggu transaksi masuk...')}</td></tr>`;
        if (txNav) txNav.classList.add('d-none');
        return;
    }

    const limit = 10;
    const start = (txCurrentPage - 1) * limit;
    const end = start + limit;
    const paginatedTx = votedVotersOnly.slice(start, end);
    const now = Date.now();

    tbody.innerHTML = paginatedTx.map((voter, index) => {
        const txHash = voter.txHash || "";
        const shortTx = `${txHash.substring(0, 10)}...${txHash.substring(60)}`;
        const shortNik = `${voter.nikHash.substring(0, 10)}...${voter.nikHash.substring(54)}`;
        
        const txTime = parseInt(voter.timestamp);
        const diffInSeconds = Math.floor((now - txTime) / 1000);
        
        let statusHTML = '';
        
        if (diffInSeconds < 5) {
            statusHTML = `
                <span class="status-pill pending">
                    <i class="bi bi-hourglass-split spinning me-1"></i> ${t('status_pending', 'PENDING')}
                </span>`;
            
            setTimeout(() => {
                renderTransactionTableRows();
            }, (5 - diffInSeconds) * 1000);
            
        } else {
            statusHTML = `
                <span class="status-pill">
                    <i class="bi bi-check-circle-fill me-1"></i> ${t('status_success', 'SUCCESS')}
                </span>`;
        }

        return `
            <tr>
                <td class="ps-4 text-muted mono" style="font-size: 0.75rem;">${start + index + 1}</td>
                <td>
                    <a href="https://sepolia.etherscan.io/tx/${txHash}" target="_blank" class="text-decoration-none mono small text-primary">
                        ${shortTx} <i class="bi bi-box-arrow-up-right ms-1"></i>
                    </a>
                </td>
                <td>
                    <div class="d-flex align-items-center">
                        <div class="icon-circle bg-blue me-3" style="width: 32px; height: 32px; font-size: 0.8rem;">
                            <i class="bi bi-person-lock"></i>
                        </div>
                        <span class="mono small text-main">${shortNik}</span>
                    </div>
                </td>
                <td class="small text-muted live-time" data-time="${voter.timestamp}">
                    ${timeAgo(voter.timestamp)}
                </td>
                <td class="text-center">
                    ${statusHTML}
                </td>
            </tr>
        `;
    }).join('');

    if (txNav) {
        votedVotersOnly.length > limit ? txNav.classList.remove('d-none') : txNav.classList.add('d-none');
        if (btnPrevTx) btnPrevTx.disabled = (txCurrentPage === 1);
        if (btnNextTx) btnNextTx.disabled = (end >= votedVotersOnly.length);
    }
}

/**
 * 4. BLOCKCHAIN TIMER & UTILITIES
 */
async function startCountdownTimer() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();

        updateStatusBadge(data.status);

        const timerEl = document.getElementById('statTimer');
        if (!timerEl) return;

        if (data.status === 'active' && data.targetTime) {
            const timerInterval = setInterval(() => {
                const now = Date.now();
                const diff = data.targetTime - now;

                if (diff <= 0) {
                    clearInterval(timerInterval);
                    timerEl.innerText = t('status_ended', 'SELESAI');
                    
                    if (sessionStorage.getItem('log_ended_triggered') !== 'true') {
                        addLog('log_voting_ended', "warning");
                        sessionStorage.setItem('log_ended_triggered', 'true');
                        refreshDashboardStatus();
                    }
                } else {
                    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                    timerEl.innerText = `${h}:${m}:${s}`;
                }
            }, 1000);
        } else if (data.status === 'ended') {
            timerEl.innerText = t('status_ended', 'SELESAI');
            sessionStorage.setItem('log_ended_triggered', 'true');
        } else if (data.status === 'upcoming') {
            // Tampilkan garis strip saat belum dimulai
            timerEl.innerText = "--:--:--";
        } else {
            timerEl.innerText = "--:--:--";
        }
    } catch (e) {
        addLog('log_server_sync_failed', "danger");
    }
}

/**
 * UTILITY: Mengubah Timestamp menjadi format time ago multi-bahasa
 */
function timeAgo(timestamp) {
    if (!timestamp) return "-";
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 5) {
        return currentLang === 'en' ? 'Just now' : 'Baru saja';
    }
    if (diffInSeconds < 60) {
        return currentLang === 'en' ? `${diffInSeconds}s ago` : `${diffInSeconds} detik lalu`;
    }
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) {
        return currentLang === 'en' ? `${diffInMinutes}m ago` : `${diffInMinutes} menit lalu`;
    }
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) {
        return currentLang === 'en' ? `${diffInHours}h ago` : `${diffInHours} jam lalu`;
    }
    
    const locale = currentLang === 'en' ? 'en-US' : 'id-ID';
    return past.toLocaleDateString(locale);
}

function startLiveTimeUpdates() {
    setInterval(() => {
        document.querySelectorAll('.live-time').forEach(el => {
            const timestamp = el.getAttribute('data-time');
            if (timestamp && timestamp !== "null") {
                el.innerText = timeAgo(parseInt(timestamp));
            }
        });
    }, 10000);
}

// === PERBAIKAN FUNGSI SISTEM LOG DENGAN PARAMETER & KEY TRANS translation ===
function addLog(messageKey, type = "info", params = null) {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
    const time = new Date().toLocaleTimeString(timeLocale, { hour12: false });
    const logData = { time, messageKey, type, params };

    let logs = JSON.parse(localStorage.getItem('admin_logs')) || [];
    logs.unshift(logData);

    if (logs.length > 100) logs.pop();

    localStorage.setItem('admin_logs', JSON.stringify(logs));
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    const logs = JSON.parse(localStorage.getItem('admin_logs')) || [];
    
    container.innerHTML = logs.map(log => {
        let text = t(log.messageKey, log.messageKey);
        if (log.params) {
            text = `${text} ${log.params}`;
        }

        return `
            <div class="log-item ${log.type}">
                <span class="time">[${log.time}]</span> ${text}
            </div>
        `;
    }).join('');
}

function refreshLogs() {
    const icon = event.currentTarget.querySelector('i');
    if (icon) icon.classList.add('bi-spin');
    
    renderLogs();
    
    setTimeout(() => {
        if (icon) icon.classList.remove('bi-spin');
    }, 500);
}

async function showVoterData() {
    const modalElement = document.getElementById('modalDataPemilih');
    const voterModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    voterModal.show();

    document.getElementById('voterSearchInput').value = "";
    currentPage = 1;

    try {
        const res = await fetch(`${BACKEND_URL}/admin/config`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();
        allVoters = data.votersList || [];
        filteredVoters = [...allVoters];

        renderVoterTable();
    } catch (err) {
        document.getElementById('voterTableBody').innerHTML = `<tr><td colspan="3">${t('err_load_data', 'Gagal load data.')}</td></tr>`;
    }
}

function renderVoterTable() {
    const tbody = document.getElementById('voterTableBody');
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    const paginatedItems = filteredVoters.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-4 text-muted">${t('data_not_found', 'Data tidak ditemukan.')}</td></tr>`;
        document.getElementById('paginationInfo').innerText = "0 data";
        return;
    }

    const textVoted = currentLang === 'en' ? 'Voted' : 'Sudah';
    const textNotVoted = currentLang === 'en' ? 'Not Voted' : 'Belum';

    tbody.innerHTML = paginatedItems.map((voter, index) => {
        const statusBadge = voter.voted
            ? `<span class="badge bg-success-subtle text-success border border-success px-3">${textVoted}</span>`
            : `<span class="badge bg-secondary-subtle text-muted border border-secondary px-3">${textNotVoted}</span>`;

        return `
            <tr>
                <td class="ps-4 text-muted small">${start + index + 1}</td>
                <td class="mono small font-monospace">${voter.nikHash}</td>
                <td class="text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');

    const textShowing = currentLang === 'en' ? 'Showing' : 'Menampilkan';
    const textOf = currentLang === 'en' ? 'of' : 'dari';

    document.getElementById('paginationInfo').innerText =
        `${textShowing} ${start + 1} - ${Math.min(end, filteredVoters.length)} ${textOf} ${filteredVoters.length}`;

    document.getElementById('prevPage').disabled = (currentPage === 1);
    document.getElementById('nextPage').disabled = (end >= filteredVoters.length);
}

async function showKandidatData() {
    const container = document.getElementById('kandidatContainer');
    const modalElement = document.getElementById('modalKandidat');
    const modal = new bootstrap.Modal(modalElement);

    container.innerHTML = '<div class="text-center p-5 w-100"><div class="spinner-border text-primary"></div></div>';
    modal.show();

    try {
        const res = await fetch(`${BACKEND_URL}/results`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();
        
        allCandidatesData = data; 

        const candidateNoText = currentLang === 'en' ? 'No.' : 'No. Urut';
        const visionText = currentLang === 'en' ? 'Vision' : 'Visi';
        const validVotesText = currentLang === 'en' ? 'Valid Votes' : 'Suara Sah';
        const detailBtnText = currentLang === 'en' ? 'Profile Details' : 'Detail Profil';

        container.innerHTML = data.map((k, index) => {
            const visiText = (currentLang === 'en' && k.visi_en) ? k.visi_en : k.visi;

            return `
                <div class="col-md-6 col-xl-4">
                    <div class="card h-100 card-custom border-0 shadow-lg">
                        <div class="position-relative">
                            <img src="${getFullImageUrl(k.foto)}" class="card-img-top" style="height: 250px; object-fit: cover;">
                            <span class="position-absolute top-0 end-0 m-3 badge rounded-pill bg-primary px-3 shadow">
                                ${candidateNoText} ${k.noUrut}
                            </span>
                        </div>
                        <div class="card-body p-4">
                            <h5 class="fw-bold mb-1" style="color: var(--text-main);">${k.nama}</h5>
                            ${k.wakil ? `<div class="small text-muted mb-2"><i class="bi bi-person-badge me-1"></i>Wakil: ${k.wakil}</div>` : ''}
                            <div class="p-3 rounded-3 mb-3" style="background: var(--input-bg); border: 1px solid var(--border);">
                                <h6 class="small fw-bold text-uppercase opacity-50" style="color: var(--text-muted);">${visionText}</h6>
                                <p class="small mb-0 text-truncate-3" style="color: var(--text-main);">${visiText}</p>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <span class="status-pill">${k.votes || 0} ${validVotesText}</span>
                                <button onclick="showCandidateDetail(${index})" class="btn btn-sm btn-outline-primary rounded-pill px-3">
                                    ${detailBtnText}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        container.innerHTML = `
        <div class="col-12 text-center py-5" style="animation: fadeIn 0.5s ease;">
            <div class="mb-4">
                <i class="bi bi-cloud-slash display-1 text-muted"></i>
            </div>
            <h4 class="fw-bold">${t('err_load_candidate_title', 'Gagal Memuat Kandidat')}</h4>
            <p class="text-secondary mb-4">${t('net_error_desc', 'Terjadi masalah koneksi ke server. Silakan coba muat ulang halaman.')}</p>
            
            <button onclick="location.reload()" class="btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm">
                <i class="bi bi-arrow-clockwise me-2"></i> ${t('btn_try_again', 'Muat Ulang Halaman')}
            </button>
        </div>`;
    }
}

function showCandidateDetail(index) {
  const cand = allCandidatesData[index];
  const modal = new bootstrap.Modal(document.getElementById('candidateModal'));

  document.getElementById('modalHeaderColor').style.background = 
    `linear-gradient(135deg, ${cand.warna} 0%, ${cand.warna}dd 100%)`;
  document.getElementById('modalNoUrut').style.backgroundColor = cand.warna;
  document.getElementById('modalNoUrut').classList.add('text-white');

  const candidateNoPrefix = currentLang === 'en' ? 'Candidate No.' : 'No. Urut';

  document.getElementById('modalFoto').src = getFullImageUrl(cand.foto);
  document.getElementById('modalNoUrut').innerText = `${candidateNoPrefix} ${cand.noUrut}`;
  
  let displayName = cand.nama;
  if (cand.wakil) {
      displayName += ` & ${cand.wakil}`;
  }
  document.getElementById('modalNamaKetua').innerText = displayName;

  const taglineText = (currentLang === 'en' && cand.tagline_en) ? cand.tagline_en : cand.tagline;
  const visiText = (currentLang === 'en' && cand.visi_en) ? cand.visi_en : cand.visi;
  const misiArray = (currentLang === 'en' && cand.misi_en) ? cand.misi_en : cand.misi;

  document.getElementById('modalTagline').innerText = taglineText || '';
  document.getElementById('modalVisi').innerText = visiText || '';

  const misiList = document.getElementById('modalMisi');
  misiList.innerHTML = '';
  if (Array.isArray(misiArray)) {
    misiArray.forEach(m => {
      misiList.innerHTML += `<li>${m}</li>`;
    });
  }

  modal.show();
}

/**
 * KONFIGURASI DURASI OTOMATIS (Dalam Jam)
 */
const DEFAULT_VOTING_DURATION = 1; 

async function startVotingProcess() {
    const modalEl = document.getElementById('modalConfirmStart');
    const confirmModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const btnConfirmExecute = document.getElementById('btnConfirmExecute');

    // Ambil tombol pembatalan & penutup modal
    const btnCancel = modalEl.querySelector('[data-bs-dismiss="modal"]');
    
    const originalModalHTML = btnConfirmExecute.innerHTML;
    
    confirmModal.show();

    btnConfirmExecute.disabled = false;
    if (btnCancel) btnCancel.disabled = false;
    btnConfirmExecute.innerHTML = originalModalHTML;

    btnConfirmExecute.onclick = async () => {
        try {
            btnConfirmExecute.disabled = true;
            if (btnCancel) btnCancel.disabled = true;
            btnConfirmExecute.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('btn_connecting', 'Menghubungkan...')}`;

            await executeVotingActivation(btnConfirmExecute);
            confirmModal.hide();
            
        } catch (err) {
            console.error("Proses terhenti:", err);
            
            btnConfirmExecute.disabled = false;
            if (btnCancel) btnCancel.disabled = false;
            btnConfirmExecute.innerHTML = originalModalHTML;
            
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                addLog('log_tx_cancelled', 'danger');
            } else {
                addLog(`Error: ${err.message}`, 'danger');
            }
        }
    };
}

async function executeVotingActivation(modalBtn) {
    const btnDashboard = document.getElementById('btnStartVoting');
    const originalDashboardHTML = btnDashboard.innerHTML;

    try {
        btnDashboard.disabled = true;
        btnDashboard.dataset.processing = "true";
        btnDashboard.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('status_processing', 'Processing...')}`;

        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
            headers: NGROK_HEADERS
        });
        const config = await configRes.json();

        if (!window.ethereum) throw new Error(t('err_no_metamask', 'MetaMask tidak ditemukan'));

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        const contract = new ethers.Contract(config.contractAddress, config.abi, signer);

        addLog('log_awaiting_metamask_confirm', 'warning');
        
        if (modalBtn) modalBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('btn_confirm_metamask', 'Konfirmasi di MetaMask...')}`;

        const durationSeconds = DEFAULT_VOTING_DURATION * 3600;
        const tx = await contract.startVoting(durationSeconds); 
        
        const shortTxHash = `${tx.hash.substring(0,6)}...${tx.hash.substring(tx.hash.length-4)}`;
        addLog('log_tx_sent', 'info', shortTxHash);
        
        if (modalBtn) modalBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${t('btn_awaiting_confirm', 'Menunggu Konfirmasi...')}`;

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            addLog('log_voting_opened', 'success');
            addLog('log_voting_duration', 'info', `${DEFAULT_VOTING_DURATION} Jam`);
            setTimeout(() => window.location.reload(), 2000);
        }

    } catch (err) {
        btnDashboard.disabled = false;
        delete btnDashboard.dataset.processing;
        btnDashboard.innerHTML = originalDashboardHTML;
        throw err; 
    }
}

async function refreshDashboardStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
            headers: NGROK_HEADERS
        });
        const data = await res.json();
        const btnStart = document.getElementById('btnStartVoting');

        updateStatusBadge(data.status);

        if (btnStart) {
            // Hindari menimpa tampilan tombol jika sedang dalam proses transaksi (Processing...)
            if (btnStart.dataset.processing === "true") return;

            const status = data.status ? data.status.toLowerCase() : '';

            if (status === 'active') {
                sessionStorage.removeItem('log_ended_triggered');
                btnStart.disabled = true;
                const activeText = t('btn_voting_active', 'Voting Berlangsung');
                btnStart.innerHTML = `<i class="bi bi-check-all me-2"></i>${activeText}`;
                btnStart.className = 'btn btn-success rounded-pill px-4 py-2 fw-bold shadow-sm';
            } else if (status === 'ended') {
                btnStart.disabled = true;
                const endedText = t('btn_voting_ended', 'Voting Telah Berakhir');
                btnStart.innerHTML = `<i class="bi bi-slash-circle me-2"></i>${endedText}`;
                btnStart.className = 'btn btn-danger rounded-pill px-4 py-2 fw-bold shadow-sm';
            } else {
                btnStart.disabled = false;
                const openText = t('btn_open_voting', 'Buka Voting');
                btnStart.innerHTML = `<i class="bi bi-play-fill me-2"></i>${openText}`;
                btnStart.className = 'btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm';
            }
        }
    } catch (err) {
        console.error("Gagal refresh status:", err);
    }
}

/**
 * Update visual badge status voting di Dashboard
 */
function updateStatusBadge(status) {
    const badge = document.getElementById('badgeStatusVoting');
    if (!badge) return;

    badge.className = 'badge rounded-pill';

    switch (status.toLowerCase()) {
        case 'active':
            badge.innerText = t('status_active', 'Status: Voting Aktif');
            badge.classList.add('bg-success', 'animate-pulse');
            break;
        case 'ended':
            badge.innerText = t('status_ended_badge', 'Status: Voting Selesai');
            badge.classList.add('bg-danger');
            break;
        case 'upcoming':
            badge.innerText = t('status_upcoming', 'Status: Belum Dimulai');
            badge.classList.add('bg-warning', 'text-dark');
            break;
        default:
            badge.innerText = t('status_locked', 'Status: Terkunci');
            badge.classList.add('bg-secondary');
    }
}

function checkMetaMaskAvailability() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const btn = document.getElementById('btnConnectMetamask');

    if (typeof window.ethereum !== 'undefined') {
        if (dot) dot.className = 'dot-indicator dot-amber';
        if (text) text.textContent = currentLang === 'en' ? 'Awaiting connection...' : 'Menunggu koneksi...';
        if (btn) btn.classList.remove('opacity-50');
    } else {
        if (dot) dot.className = 'dot-indicator dot-red';
        if (text) text.textContent = currentLang === 'en' ? 'MetaMask not detected' : 'MetaMask tidak terdeteksi';
        
        if (btn) {
            btn.innerHTML = `<i class="bi bi-download me-2"></i>${currentLang === 'en' ? 'Install MetaMask' : 'Install MetaMask'}`;
            btn.classList.remove('opacity-50');
            btn.onclick = () => window.open('https://metamask.io/download/', '_blank');
        }
    }
}

function updateLoginClock() {
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0];
    const loginTimer = document.getElementById('loginTimer');
    if (loginTimer) loginTimer.textContent = timeString;
}

function confirmLogout() {
    const modalEl = document.getElementById('modalConfirmLogout');
    const logoutModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const btnDoLogout = document.getElementById('btnDoLogout');

    logoutModal.show();

    if (btnDoLogout) {
        btnDoLogout.onclick = () => {
            executeLogout();
        };
    }
}

function executeLogout() {
    if (typeof eventSource !== 'undefined' && eventSource) {
        eventSource.close();
    }
    sessionStorage.clear();
    window.location.reload();
}