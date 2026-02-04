/**
 * KONFIGURASI GLOBAL
 */
const BACKEND_URL = 'https://9577e98f93a3.ngrok-free.app';
const NGROK_HEADERS = {
    "ngrok-skip-browser-warning": "69420"
};
let provider, signer, adminAddress;
let eventSource;
let AUTHORIZED_ADMIN = "";
let TOTAL_DPT = 0;

// State untuk Tabel & Pagination (Pindahkan ke sini agar tidak undefined)
let allVoters = [];
let filteredVoters = [];
let votedVotersOnly = []; 
let currentPage = 1;      // Pagination Modal DPT
let txCurrentPage = 1;    // Pagination Tabel Utama
const rowsPerPage = 10;

function getFullImageUrl(path) {
    if (!path) return '/img/default.png';
    if (path.startsWith('http')) return path;
    const fileName = path.split('/').pop();
    return `/img/${fileName}`;
}

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inisialisasi Tema
    themeHandler.init();

    // 2. Cek ketersediaan MetaMask (Visual Indikator)
    checkMetaMaskAvailability();

    // 3. Jalankan Jam Login
    setInterval(updateLoginClock, 1000);
    updateLoginClock();

    // 4. Cek Sesi Login
    checkSession();

    // 5. Pasang Event Listeners
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

        // Tandai dropdown item yang aktif
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
    if(logoutBtnSidebar) logoutBtnSidebar.onclick = (e) => { e.preventDefault(); confirmLogout(); };
    if(logoutBtnNavbar) logoutBtnNavbar.onclick = (e) => { e.preventDefault(); confirmLogout(); };

    // Di dalam fungsi initEventListeners()
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

    document.getElementById('prevPage').addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderVoterTable();
        }
    });

    document.getElementById('nextPage').addEventListener('click', () => {
        if ((currentPage * rowsPerPage) < allVoters.length) {
            currentPage++;
            renderVoterTable();
        }
    });

    const searchInput = document.getElementById('voterSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const keyword = e.target.value.toLowerCase();

            // Filter data berdasarkan NIK Hash
            filteredVoters = allVoters.filter(voter =>
                voter.nikHash.toLowerCase().includes(keyword)
            );

            currentPage = 1; // Balik ke halaman 1 saat mencari
            renderVoterTable();
        });
    }

    // TAMBAHKAN LOGIKA TOMBOL PAGINATION TRANSAKSI
    const btnPrevTx = document.getElementById('prevTxPage');
    const btnNextTx = document.getElementById('nextTxPage');

    if (btnPrevTx) {
        btnPrevTx.onclick = () => {
            if (txCurrentPage > 1) {
                txCurrentPage--;
                renderTransactionTableRows(); // Fungsi baru untuk render ulang
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

    // Tambahkan di initEventListeners
    document.getElementById('menuKandidat').onclick = (e) => { e.preventDefault(); showKandidatData(); };
}

async function checkSession() {
    try {
        // 1. Ambil config dari backend
        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const configData = await configRes.json();

        AUTHORIZED_ADMIN = configData.authorizedAdmin.toLowerCase();
        TOTAL_DPT = configData.totalDPT;

        const isAuth = sessionStorage.getItem('adminAuth');
        
        // 2. Jika status auth ada, validasi ulang dengan MetaMask aktif
        if (isAuth === 'true' && window.ethereum) {
            provider = new ethers.BrowserProvider(window.ethereum);
            const accounts = await provider.listAccounts(); // Cek akun aktif sekarang
            
            // Ambil address aktif (jika ada)
            const currentAddress = accounts.length > 0 ? accounts[0].address.toLowerCase() : null;
            const savedAddress = sessionStorage.getItem('adminAddress')?.toLowerCase();

            // VALIDASI KRUSIAL: 
            // Cek apakah MetaMask terkoneksi, akunnya sama dengan session, DAN akunnya adalah admin resmi
            if (currentAddress && currentAddress === savedAddress && currentAddress === AUTHORIZED_ADMIN) {
                signer = await provider.getSigner();
                showDashboard(savedAddress);
            } else {
                // Jika akun berubah saat refresh atau bukan admin, langsung tendang
                executeLogout(); 
            }
        } else if (isAuth === 'true' && !window.ethereum) {
            // Jika status auth true tapi MetaMask hilang (extension di-disable)
            executeLogout();
        }

    } catch (err) {
        console.error("Gagal load config atau validasi sesi:", err);
        // Opsi: Tampilkan modal error koneksi jika gagal fetch config
    }
}

async function connectWallet() {
    const btnConnect = document.getElementById('btnConnectMetamask');
    const status = document.getElementById('loginStatus');
    status.className = "mt-3 small text-primary";
    status.innerText = "Menghubungkan ke server...";

    btnConnect.disabled = true;
    const originalText = btnConnect.innerHTML;
    btnConnect.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menghubungkan...';

    try {
        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        if (!configRes.ok) throw new Error("Gagal mengambil konfigurasi server.");
        const configData = await configRes.json();
        AUTHORIZED_ADMIN = configData.authorizedAdmin.toLowerCase();

        if (typeof window.ethereum === 'undefined') {
            throw new Error("Setelah instalasi selesai, silakan refresh halaman ini.");
        }

        provider = new ethers.BrowserProvider(window.ethereum);
        const accounts = await provider.send("eth_requestAccounts", []);
        signer = await provider.getSigner();
        adminAddress = (await signer.getAddress()).toLowerCase();

        if (adminAddress !== AUTHORIZED_ADMIN) {
            status.className = "mt-3 small text-danger";
            status.innerText = "Akses Ditolak: Anda bukan Admin.";
            return;
        }

        // --- BAGIAN SIGNATURE CHALLENGE ---
        status.innerText = "Silakan tanda tangani permintaan masuk di MetaMask...";
        const message = `Login Admin Panel\nTime: ${new Date().toLocaleString()}\nNonce: ${Math.floor(Math.random() * 1000000)}`;
        
        try {
            await signer.signMessage(message);
        } catch (signErr) {
            // Menangani jika user menekan 'Cancel' pada pop-up Signature
            if (signErr.code === 'ACTION_REJECTED' || signErr.code === 4001) {
                throw new Error("Login dibatalkan: Tanda tangan diperlukan untuk akses ke dashboard.");
            }
            throw signErr;
        }

        // Berhasil Login
        sessionStorage.setItem('adminAuth', 'true');
        sessionStorage.setItem('adminAddress', adminAddress);

        showDashboard(adminAddress);
        addLog(`Admin login berhasil: ${adminAddress.substring(0, 6)}...${adminAddress.substring(adminAddress.length - 4)}`, "success");

    } catch (err) {
        console.error("Login Error:", err.code, err.message);
        
        status.className = "mt-3 small text-danger";
        // Menampilkan pesan yang lebih ramah pengguna
        if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
            status.innerText = "Akun belum tersedia! Silahkan masuk menggunakan akun admin";
        } else {
            status.innerText = err.message || "Gagal menghubungkan MetaMask.";
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
        // Jika user ganti akun di MetaMask
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0 || accounts[0].toLowerCase() !== AUTHORIZED_ADMIN) {
                showAdminAuthModal();
            }
        });
        // Jika user ganti network (misal dari Sepolia ke Mainnet)
        window.ethereum.on('chainChanged', () => window.location.reload());
    }

    // Tampilkan Address di UI
    const displayAddr = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
    document.getElementById('adminWallet').innerText = displayAddr;

    renderLogs();
    // Mulai Sinkronisasi Data
    startRealtimeStream();
    startCountdownTimer();
    startLiveTimeUpdates();
    refreshDashboardStatus();
}

function showAdminAuthModal() {
    // Tampilkan modal
    const authModal = new bootstrap.Modal(document.getElementById('adminAuthModal'));
    authModal.show();

    // Jalankan Countdown 5 detik
    let timeLeft = 5;
    const countdownEl = document.getElementById('adminCountdown');

    const timer = setInterval(() => {
        timeLeft--;
        if (countdownEl) countdownEl.innerText = timeLeft;

        if (timeLeft <= 0) {
            clearInterval(timer);
            executeLogout(); // Pastikan fungsi logout Anda sudah benar
        }
    }, 1000);
}

async function startRealtimeStream() {
    // --- LANGKAH 1: Ambil Data Awal (Fetch) ---
    // Ini krusial karena SSE sering tertahan proteksi browser/ngrok di awal
    try {
        const res = await fetch(`${BACKEND_URL}/results`, { 
            headers: NGROK_HEADERS 
        });
        if (res.ok) {
            const initialData = await res.json();
            updateDashboardUI(initialData); // Tampilkan data segera
            
            // Ambil data pemilih juga untuk tabel transaksi
            const configRes = await fetch(`${BACKEND_URL}/admin/config`, { headers: NGROK_HEADERS });
            if (configRes.ok) {
                const configData = await configRes.json();
                updateTransactionTable(configData.votersList);
            }
        }
    } catch (err) {
        console.error("Gagal mengambil data awal via fetch:", err);
    }

    // --- LANGKAH 2: Inisialisasi Real-time Stream (SSE) ---
    if (eventSource) eventSource.close();
    
    eventSource = new EventSource(`${BACKEND_URL}/results-stream`);

    eventSource.onmessage = async (event) => {
        try {
            // 1. Update Leaderboard & Statistik dari data Stream
            const candidates = JSON.parse(event.data);
            updateDashboardUI(candidates);
            
            // 2. Ambil ulang config untuk Sinkronisasi Tabel Transaksi
            const configRes = await fetch(`${BACKEND_URL}/admin/config`, { 
                headers: NGROK_HEADERS 
            });
            if (configRes.ok) {
                const configData = await configRes.json();
                updateTransactionTable(configData.votersList);
            }
            
            addLog("Blockchain sync: Node diperbarui.", "info");
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

    // 1. Kalkulasi Total Suara
    const totalVotes = candidates.reduce((sum, c) => sum + (Number(c.votes) || 0), 0);

    // 2. Kalkulasi Partisipasi
    const participation = TOTAL_DPT > 0 ? ((totalVotes / TOTAL_DPT) * 100).toFixed(1) : 0;

    // 3. Update Widget Statistik (Angka Besar)
    const elTotalVotes = document.getElementById('statTotalVotes');
    const elTotalVoters = document.getElementById('statTotalVoters');
    const elParticipation = document.getElementById('statParticipation');

    if (elTotalVotes) elTotalVotes.innerText = totalVotes.toLocaleString('id-ID');
    if (elTotalVoters) elTotalVoters.innerText = TOTAL_DPT.toLocaleString('id-ID');
    if (elParticipation) elParticipation.innerText = participation + "%";

    // 4. Update Progress Bars
    const voteBar = document.getElementById('voteProgress');
    const particBar = document.getElementById('particProgress');
    const dptBar = document.getElementById('dptProgress');

    if (voteBar) voteBar.style.width = Math.min(participation, 100) + "%";
    if (particBar) particBar.style.width = Math.min(participation, 100) + "%";
    if (dptBar) dptBar.style.width = "100%";

    // 5. Update Tabel Leaderboard
    const tbody = document.getElementById('leaderboardBody');
    if (!tbody) return;

    // Urutkan kandidat berdasarkan suara terbanyak
    const sorted = [...candidates].sort((a, b) => (Number(b.votes) || 0) - (Number(a.votes) || 0));

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
                            <div class="small text-muted">Kandidat No. ${cand.noUrut}</div>
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
                    <span class="badge bg-dark border border-secondary px-3 py-2 mono">${votes} Suara</span>
                </td>
            </tr>
        `;
    }).join('');
}

function updateTransactionTable(votersList) {
    // 1. Filter hanya yang sudah memilih (voted: true)
    // 2. Urutkan berdasarkan timestamp (Terbesar/Terbaru ke Terkecil)
    votedVotersOnly = votersList
        .filter(v => v.voted && v.timestamp) 
        .sort((a, b) => b.timestamp - a.timestamp);

    // 2. Panggil fungsi render
    renderTransactionTableRows();
}

function renderTransactionTableRows() {
    const tbody = document.getElementById('transactionTableBody');
    const txNav = document.getElementById('txPaginationNav');
    const syncText = document.getElementById('lastUpdateText');
    const btnPrevTx = document.getElementById('prevTxPage');
    const btnNextTx = document.getElementById('nextTxPage');
    
    if (!tbody) return;

    if (votedVotersOnly.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center py-5 text-muted">Menunggu transaksi pertama masuk...</td></tr>';
        if (txNav) txNav.classList.add('d-none');
        return;
    }

    if (syncText) syncText.innerText = `Last sync: ${new Date().toLocaleTimeString('id-ID')}`;

    const limit = 10;
    const start = (txCurrentPage - 1) * limit;
    const end = start + limit;
    const paginatedTx = votedVotersOnly.slice(start, end);
    const now = Date.now();

    tbody.innerHTML = paginatedTx.map((voter, index) => {
        const txHash = voter.txHash || "";
        const shortTx = `${txHash.substring(0, 10)}...${txHash.substring(60)}`;
        const shortNik = `${voter.nikHash.substring(0, 10)}...${voter.nikHash.substring(54)}`;
        
        // --- LOGIKA STATUS PENDING ---
        const txTime = parseInt(voter.timestamp);
        const diffInSeconds = Math.floor((now - txTime) / 1000);
        
        let statusHTML = '';
        
        // Jika transaksi baru masuk (kurang dari 8 detik)
        if (diffInSeconds < 5) {
            statusHTML = `
                <span class="status-pill pending">
                    <i class="bi bi-hourglass-split spinning me-1"></i> PENDING
                </span>`;
            
            // Atur timer untuk refresh otomatis setelah sisa waktu pending habis
            // Ini agar status berubah jadi MINED tanpa user harus refresh
            setTimeout(() => {
                renderTransactionTableRows();
            }, (5 - diffInSeconds) * 1000);
            
        } else {
            // Jika sudah lewat 8 detik
            statusHTML = `
                <span class="status-pill">
                    <i class="bi bi-check-circle-fill me-1"></i> SUCCESS
                </span>`;
        }
        // ------------------------------

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

    // Logic Navigasi
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
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();

        updateStatusBadge(data.status);

        if (data.status === 'active' && data.targetTime) {
            const timerInterval = setInterval(() => {
                const now = Date.now();
                const diff = data.targetTime - now;

                if (diff <= 0) {
                    clearInterval(timerInterval);
                    document.getElementById('statTimer').innerText = "ENDED";
                    
                    // --- LOGIKA BARU: Catat ke System Logs saat waktu habis ---
                    // Gunakan flag agar log tidak muncul berulang-ulang saat interval berjalan
                    if (sessionStorage.getItem('log_ended_triggered') !== 'true') {
                        addLog("Sistem: Masa voting telah berakhir.", "warning");
                        sessionStorage.setItem('log_ended_triggered', 'true');
                        refreshDashboardStatus(); // Update tombol jadi merah
                    }
                } else {
                    const h = Math.floor(diff / 3600000).toString().padStart(2, '0');
                    const m = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
                    const s = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
                    document.getElementById('statTimer').innerText = `${h}:${m}:${s}`;
                }
            }, 1000);
        } else if (data.status === 'ended') {
            document.getElementById('statTimer').innerText = "ENDED";
            // Jika saat buka dashboard status sudah ended, pastikan flag diset
            sessionStorage.setItem('log_ended_triggered', 'true');
        } else {
            document.getElementById('statTimer').innerText = data.status.toUpperCase();
        }
    } catch (e) {
        addLog("Gagal sinkronisasi ke server.", "danger");
    }
}

/**
 * UTILITY: Mengubah Timestamp menjadi format "X menit yang lalu"
 */
function timeAgo(timestamp) {
    if (!timestamp) return "-";
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);

    if (diffInSeconds < 5) return "Baru saja";
    if (diffInSeconds < 60) return `${diffInSeconds} detik lalu`;
    
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes} menit lalu`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours} jam lalu`;
    
    return past.toLocaleDateString('id-ID'); // Jika sudah lewat sehari, tampilkan tanggal
}

/**
 * Memperbarui semua teks waktu di tabel secara berkala
 */
function startLiveTimeUpdates() {
    setInterval(() => {
        document.querySelectorAll('.live-time').forEach(el => {
            const timestamp = el.getAttribute('data-time');
            if (timestamp && timestamp !== "null") {
                el.innerText = timeAgo(parseInt(timestamp));
            }
        });
    }, 10000); // Update setiap 10 detik agar tidak berat
}

function addLog(message, type = "info") {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    const time = new Date().toLocaleTimeString('id-ID', { hour12: false });
    const logData = { time, message, type };

    // 1. Ambil log lama dari localStorage
    let logs = JSON.parse(localStorage.getItem('admin_logs')) || [];
    
    // 2. Tambahkan log baru ke array
    logs.unshift(logData); // Tambah ke awal array agar yang terbaru di atas

    // 3. Batasi jumlah log (misal 100 agar tidak lemot)
    if (logs.length > 100) logs.pop();

    // 4. Simpan kembali ke localStorage
    localStorage.setItem('admin_logs', JSON.stringify(logs));

    // 5. Render ke UI
    renderLogs();
}

function renderLogs() {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    const logs = JSON.parse(localStorage.getItem('admin_logs')) || [];
    
    container.innerHTML = logs.map(log => `
        <div class="log-item ${log.type}">
            <span class="time">[${log.time}]</span> ${log.message}
        </div>
    `).join('');
}

function refreshLogs() {
    // Memberi efek putar pada icon saat diklik (opsional)
    const icon = event.currentTarget.querySelector('i');
    icon.classList.add('bi-spin'); // Anda bisa tambahkan CSS animasi putar
    
    // Render ulang dari localStorage
    renderLogs();
    
    // Simulasi loading sebentar
    setTimeout(() => icon.classList.remove('bi-spin'), 500);
}

async function showVoterData() {
    const modalElement = document.getElementById('modalDataPemilih');
    const voterModal = bootstrap.Modal.getOrCreateInstance(modalElement);
    voterModal.show();

    // Reset pencarian dan halaman
    document.getElementById('voterSearchInput').value = "";
    currentPage = 1;

    try {
        const res = await fetch(`${BACKEND_URL}/admin/config`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();
        allVoters = data.votersList || [];
        filteredVoters = [...allVoters]; // Awalnya filtered sama dengan semua data

        renderVoterTable();
    } catch (err) {
        document.getElementById('voterTableBody').innerHTML = '<tr><td colspan="3">Gagal load data.</td></tr>';
    }
}

function renderVoterTable() {
    const tbody = document.getElementById('voterTableBody');
    const start = (currentPage - 1) * rowsPerPage;
    const end = start + rowsPerPage;

    // Gunakan filteredVoters, bukan allVoters
    const paginatedItems = filteredVoters.slice(start, end);

    if (paginatedItems.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center py-4 text-muted">Data tidak ditemukan.</td></tr>';
        document.getElementById('paginationInfo').innerText = "0 data";
        return;
    }

    tbody.innerHTML = paginatedItems.map((voter, index) => {
        const statusBadge = voter.voted
            ? '<span class="badge bg-success-subtle text-success border border-success px-3">Sudah</span>'
            : '<span class="badge bg-secondary-subtle text-muted border border-secondary px-3">Belum</span>';

        return `
            <tr>
                <td class="ps-4 text-muted small">${start + index + 1}</td>
                <td class="mono small font-monospace">${voter.nikHash}</td>
                <td class="text-center">${statusBadge}</td>
            </tr>
        `;
    }).join('');

    document.getElementById('paginationInfo').innerText =
        `Menampilkan ${start + 1} - ${Math.min(end, filteredVoters.length)} dari ${filteredVoters.length}`;

    document.getElementById('prevPage').disabled = (currentPage === 1);
    document.getElementById('nextPage').disabled = (end >= filteredVoters.length);
}

async function showKandidatData() {
    const container = document.getElementById('kandidatContainer');
    const modal = new bootstrap.Modal(document.getElementById('modalKandidat'));

    container.innerHTML = '<div class="text-center p-5 w-100"><div class="spinner-border text-primary"></div></div>';
    modal.show();

    try {
        const res = await fetch(`${BACKEND_URL}/results`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();

        container.innerHTML = data.map(k => `
    <div class="col-md-6 col-xl-4">
        <div class="card h-100 card-custom border-0 shadow-lg">
            <div class="position-relative">
                <img src="${getFullImageUrl(k.foto)}" class="card-img-top" style="height: 250px; object-fit: cover;">
                <span class="position-absolute top-0 end-0 m-3 badge rounded-pill bg-primary px-3 shadow">
                    No. Urut ${k.noUrut}
                </span>
            </div>
            <div class="card-body p-4">
                <h5 class="fw-bold mb-1" style="color: var(--text-main);">${k.nama}</h5>
                <p class="text-muted small mb-3"></p>
                
                <div class="p-3 rounded-3 mb-3" style="background: var(--input-bg); border: 1px solid var(--border);">
                    <h6 class="small fw-bold text-uppercase opacity-50" style="color: var(--text-muted);">Visi</h6>
                    <p class="small mb-0 text-truncate-3" style="color: var(--text-main);">${k.visi}</p>
                </div>
                
                <div class="d-flex justify-content-between align-items-center">
                    <span class="status-pill">${k.votes} Suara Sah</span>
                    <button class="btn btn-sm btn-outline-primary rounded-pill px-3">Detail Profil</button>
                </div>
            </div>
        </div>
    </div>
`).join('');
    } catch (err) {
        container.innerHTML = '<p class="text-danger text-center">Gagal memuat data kandidat.</p>';
    }
}

/**
 * FUNGSI BARU: Memulai Sesi Voting
 */
/**
 * KONFIGURASI DURASI OTOMATIS (Dalam Jam)
 */
const DEFAULT_VOTING_DURATION = 1; 

async function startVotingProcess() {
    const modalEl = document.getElementById('modalConfirmStart');
    const confirmModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const btnConfirmExecute = document.getElementById('btnConfirmExecute');
    
    // Simpan konten asli tombol modal untuk reset nanti
    const originalModalHTML = btnConfirmExecute.innerHTML;
    
    confirmModal.show();

    // Pastikan tombol di-reset setiap kali modal dibuka kembali
    btnConfirmExecute.disabled = false;
    btnConfirmExecute.innerHTML = originalModalHTML;

    btnConfirmExecute.onclick = async () => {
        try {
            // 1. Jalankan Loading pada tombol di dalam Modal
            btnConfirmExecute.disabled = true;
            btnConfirmExecute.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menghubungkan...';

            // 2. Jalankan fungsi aktivasi (tunggu sampai proses kirim tx selesai)
            await executeVotingActivation(btnConfirmExecute);

            // 3. Jika berhasil sampai tahap kirim, baru tutup modal
            confirmModal.hide();
            
        } catch (err) {
            console.error("Proses terhenti:", err);
            
            // 4. FIX: Reset loading spinner jika user menolak/gagal
            btnConfirmExecute.disabled = false;
            btnConfirmExecute.innerHTML = originalModalHTML;
            
            if (err.code === 'ACTION_REJECTED' || err.code === 4001) {
                addLog("Transaksi dibatalkan oleh Admin.", "danger");
            } else {
                addLog(`Error: ${err.message}`, "danger");
            }
        }
    };
}

async function executeVotingActivation(modalBtn) {
    const btnDashboard = document.getElementById('btnStartVoting');
    const originalDashboardHTML = btnDashboard.innerHTML;

    try {
        // Status Loading pada tombol utama dashboard (sebagai cadangan)
        btnDashboard.disabled = true;
        btnDashboard.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';

        const configRes = await fetch(`${BACKEND_URL}/admin/config`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const config = await configRes.json();

        if (!window.ethereum) throw new Error("MetaMask tidak ditemukan");

        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        const contract = new ethers.Contract(config.contractAddress, config.abi, signer);

        addLog("Menunggu konfirmasi di MetaMask...", "warning");
        
        // Update teks tombol modal agar user tahu sedang menunggu tanda tangan
        if (modalBtn) modalBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Konfirmasi di MetaMask...';

        const durationSeconds = DEFAULT_VOTING_DURATION * 3600;
        const tx = await contract.startVoting(durationSeconds); 
        
        addLog(`Transaksi dikirim: ${tx.hash.substring(0,10)}...`, "info");
        
        // Update teks tombol modal saat menunggu mining
        if (modalBtn) modalBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menunggu Konfirmasi...';

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            addLog("Voting BERHASIL dibuka!", "success");
            addLog(`Sistem: Durasi berlangsung ${DEFAULT_VOTING_DURATION} Jam.`, "info");
            setTimeout(() => window.location.reload(), 2000);
        }

    } catch (err) {
        // Lempar error ke pemanggil (startVotingProcess) agar spinner di modal bisa di-reset
        btnDashboard.disabled = false;
        btnDashboard.innerHTML = originalDashboardHTML;
        throw err; 
    }
}

async function refreshDashboardStatus() {
    try {
        const res = await fetch(`${BACKEND_URL}/voting-status`, {
    headers: NGROK_HEADERS // Tambahkan ini
});
        const data = await res.json();
        const btnStart = document.getElementById('btnStartVoting');

        // Update Badge Visual
        updateStatusBadge(data.status);

        // LOGIKA TOMBOL: Jika aktif, sembunyikan atau ganti teksnya
        if (data.status.toLowerCase() === 'active') {
            sessionStorage.removeItem('log_ended_triggered');
            btnStart.disabled = true;
            btnStart.innerHTML = '<i class="bi bi-check-all me-2"></i>Voting Berlangsung';
            btnStart.classList.replace('btn-primary', 'btn-success');
            // Jika ingin dihilangkan sepenuhnya, gunakan: btnStart.style.display = 'none';
        } else if (data.status.toLowerCase() === 'ended') {
            btnStart.disabled = true;
            btnStart.innerHTML = '<i class="bi bi-slash-circle me-2"></i>Voting Telah Berakhir';
            btnStart.classList.replace('btn-primary', 'btn-danger');
        } else {
            // Jika status 'upcoming' atau 'idle', kembalikan ke normal
            btnStart.disabled = false;
            btnStart.innerHTML = '<i class="bi bi-play-fill me-2"></i>Buka Voting';
            btnStart.className = 'btn btn-primary rounded-pill px-4 py-2 fw-bold shadow-sm';
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

    // Reset class
    badge.className = 'badge rounded-pill';

    switch (status.toLowerCase()) {
        case 'active':
            badge.innerText = 'Status: Voting Aktif';
            badge.classList.add('bg-success', 'animate-pulse'); // Tambahkan hijau & animasi
            break;
        case 'ended':
            badge.innerText = 'Status: Voting Selesai';
            badge.classList.add('bg-danger'); // Merah
            break;
        case 'upcoming':
            badge.innerText = 'Status: Belum Dimulai';
            badge.classList.add('bg-warning', 'text-dark'); // Kuning
            break;
        default:
            badge.innerText = 'Status: Terkunci';
            badge.classList.add('bg-secondary'); // Abu-abu
    }
}

function checkMetaMaskAvailability() {
    const dot = document.getElementById('statusDot');
    const text = document.getElementById('statusText');
    const btn = document.getElementById('btnConnectMetamask');

    // Cek apakah window.ethereum (MetaMask) tersedia
    if (typeof window.ethereum !== 'undefined') {
        // JIKA TERDETEKSI
        dot.className = 'dot-indicator dot-amber';
        text.textContent = 'Menunggu koneksi...';
        btn.classList.remove('opacity-50');
    } else {
        // JIKA TIDAK TERDETEKSI
        dot.className = 'dot-indicator dot-red';
        text.textContent = 'MetaMask tidak terdeteksi';
        
        // Opsional: Buat tombol tidak bisa diklik dan beri info
        btn.innerHTML = '<i class="bi bi-download me-2"></i>Install MetaMask';
        btn.classList.remove('opacity-50');
        btn.onclick = () => window.open('https://metamask.io/download/', '_blank');
    }
}

function updateLoginClock() {
    const now = new Date();
    const timeString = now.toTimeString().split(' ')[0]; // Format HH:MM:SS
    document.getElementById('loginTimer').textContent = timeString;
}

function confirmLogout() {
    const modalEl = document.getElementById('modalConfirmLogout');
    const logoutModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    const btnDoLogout = document.getElementById('btnDoLogout');

    logoutModal.show();

    // Event klik pada tombol konfirmasi di dalam modal
    btnDoLogout.onclick = () => {
        executeLogout(); // Panggil fungsi eksekusi logout yang asli
    };
}

// Fungsi eksekusi logout yang asli
function executeLogout() {
    if (typeof eventSource !== 'undefined' && eventSource) {
        eventSource.close();
    }
    sessionStorage.clear();
    window.location.reload();
}