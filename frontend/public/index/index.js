// === KONFIGURASI ===
    const BACKEND_URL = 'http://localhost:3001';

    function getFullImageUrl(path) {
      if (!path) return 'img/default.png';
      // Jika path sudah diawali http, gunakan langsung
      if (path.startsWith('http')) return path;
      // Jika tidak, tambahkan BACKEND_URL di depannya
      // Contoh: /img/kandidat-1.png menjadi http://localhost:3001/img/kandidat-1.png
      return `${BACKEND_URL}${path.startsWith('/') ? '' : '/'}${path}`;
    }

    let countdownInterval = null;
    let currentToken = null;
    let currentNIK = null;
    let html5QrCode = null;

    // === HELPER ===
    function showStage(stageId) {
      document.querySelectorAll('[id^="stage"], #mainPage, #scanPage').forEach(el => el.style.display = 'none');
      document.getElementById(stageId).style.display = 'block';

      // LOGIKA BARU: Sembunyikan Assistive Touch saat scan
      const touchBtn = document.getElementById('theme-touch');
      if (stageId === 'scanPage') {
        touchBtn.style.setProperty('display', 'none', 'important');
      } else {
        // Tampilkan kembali sebagai flex (sesuai CSS awal)
        touchBtn.style.setProperty('display', 'flex', 'important');
      }
    }

    function showAlert(message, type = 'danger') {
      const alert = document.createElement('div');
      alert.className = `alert alert-${type} alert-dismissible fade show`;
      alert.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert"></button>`;
      document.getElementById('alertContainer').appendChild(alert);
      setTimeout(() => alert.remove(), 5000);
    }

    // === SCAN QR FULL SCREEN ===
    function openScanMode() {
      showStage('scanPage');

      html5QrCode = new Html5Qrcode("reader");

      html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 300, height: 300 } },
        (decodedText) => {
          html5QrCode.stop().then(() => processToken(decodedText.trim()));
        },
        (err) => { /* ignore */ }
      ).catch(() => {
        showAlert('Gagal membuka kamera. Pastikan izin kamera diizinkan.');
        closeScanMode();
      });
    }

    function closeScanMode() {
      if (html5QrCode) {
        html5QrCode.stop();
        html5QrCode = null;
      }
      showStage('mainPage');
    }

    // === PROSES TOKEN ===
    async function processToken(token) {
      if (!token) return;

      closeScanMode();
      showStage('stageLoading');

      try {
        const res = await fetch(`${BACKEND_URL}/verify-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });

        const data = await res.json();

        if (!data.success) throw new Error(data.error || 'Token tidak valid');

        currentToken = token;
        showStage('stage2');
        document.getElementById('nikInput').focus();

      } catch (err) {
        showAlert(err.message || 'Gagal memverifikasi token');
        showStage('mainPage');
      }
    }

    // === EVENT LISTENER ===
    document.getElementById('btnScanQR').addEventListener('click', openScanMode);
    document.getElementById('btnCloseScan').addEventListener('click', closeScanMode);

    document.getElementById('btnChooseGallery').addEventListener('click', () => {
      document.getElementById('fileInput').click();
    });

    document.getElementById('fileInput').addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      showStage('stageLoading');

      const scanner = new Html5Qrcode("reader");

      scanner.scanFile(file, true)
        .then(decoded => processToken(decoded.trim()))
        .catch(() => {
          showAlert('Tidak dapat membaca QR dari gambar. Pastikan gambar jelas dan berisi QR code yang valid.');
          showStage('scanPage');
        })
        .finally(() => scanner.clear());
    });

    // Verifikasi manual
    document.getElementById('btnVerifyToken').addEventListener('click', () => {
      const token = document.getElementById('inputToken').value.trim();
      if (token) processToken(token);
      else showAlert('Masukkan kode token terlebih dahulu!');
    });

    // Fungsi untuk mengecek status voting dari contract melalui backend
    async function checkVotingStatus() {
      try {
        const res = await fetch(`${BACKEND_URL}/voting-status`);
        const data = await res.json();

        // Cari atau buat container timer di dalam alert
        let timerDisplay = document.getElementById('countdownTimer');
        let badgeContainer = document.getElementById('statusBadgeContainer');

        if (!timerDisplay) {
          const alertBox = document.querySelector('#stagePanduan .alert-info');
          alertBox.classList.add('alert-info-custom', 'text-center');
          alertBox.innerHTML = `
                <div class="mb-2 small text-uppercase fw-bold text-muted">Status Pemilihan</div>
                <div id="statusBadgeContainer"></div>
                <div id="countdownTimer">00:00:00</div>
                <div id="timerLabel" class="small text-muted">Waktu tersisa untuk memberikan suara</div>
            `;
          timerDisplay = document.getElementById('countdownTimer');
          badgeContainer = document.getElementById('statusBadgeContainer');
        }

        const btnStart = document.getElementById('btnStartVoting');

        // Hentikan interval sebelumnya jika ada sebelum memulai yang baru
        if (countdownInterval) clearInterval(countdownInterval);

        if (data.status === 'active') {
          badgeContainer.innerHTML = '<span class="badge-status bg-success-subtle text-success border border-success"><span class="pulse-dot"></span> BERLANGSUNG</span>';
          btnStart.disabled = false;

          // Jalankan timer
          runTimer(data.targetTime, timerDisplay, () => {
            badgeContainer.innerHTML = '<span class="badge-status bg-danger-subtle text-danger border border-danger">WAKTU HABIS</span>';
            btnStart.disabled = true;
            timerDisplay.innerText = "00:00:00";
            document.getElementById('timerLabel').innerText = "Sesi telah berakhir secara otomatis.";
          });

        } else if (data.status === 'upcoming') {
          badgeContainer.innerHTML = '<span class="badge-status bg-warning-subtle text-warning border border-warning">BELUM DIMULAI</span>';
          btnStart.disabled = false;
          timerDisplay.innerText = "--:--:--";
          document.getElementById('timerLabel').innerText = "Menunggu pembukaan oleh panitia.";

        } else {
          badgeContainer.innerHTML = '<span class="badge-status bg-secondary-subtle text-secondary border border-secondary">VOTING SELESAI</span>';
          btnStart.disabled = false;
          timerDisplay.innerText = "CLOSED";
          document.getElementById('timerLabel').innerText = "Penerimaan suara telah ditutup.";
        }
      } catch (err) {
        console.error("Gagal cek status:", err);
      }
    }

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

      update(); // Jalankan sekali langsung tanpa nunggu 1 detik
      countdownInterval = setInterval(update, 1000);
    }

    // === INPUT NIK + VALIDASI NIK HASH ===
    document.getElementById('formNIK').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nik = document.getElementById('nikInput').value.trim();

      if (!/^\d{16}$/.test(nik)) {
        showAlert('NIK harus tepat 16 digit angka!');
        return;
      }

      currentNIK = nik;
      showStage('stageLoading');

      try {
        const res = await fetch(`${BACKEND_URL}/verify-nik`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nik: nik })
        });

        const data = await res.json();
        if (!data.success) throw new Error(data.error);

        // BERHASIL: Munculkan Panduan terlebih dahulu
        showStage('stagePanduan');
        checkVotingStatus();
        loadCandidatePreview();

      } catch (err) {
        showAlert(err.message);
        showStage('stage2');
      }
    });

    // === BARU: Navigasi ke user.html ===
    document.getElementById('btnStartVoting').addEventListener('click', () => {
      // Simpan NIK dan Token di SessionStorage agar bisa dibaca di user.html
      sessionStorage.setItem('voterNIK', currentNIK);
      sessionStorage.setItem('voterToken', currentToken);

      // Arahkan ke halaman user.html
      window.location.href = '../user/user.html';
    });

    let allCandidatesData = [];

    // 1. Ambil data gabungan dari Backend
    async function loadCandidatePreview() {
      try {
        const res = await fetch(`${BACKEND_URL}/results`);
        allCandidatesData = await res.json();

        const previewList = document.getElementById('candidatePreviewList');
        previewList.innerHTML = '';

        allCandidatesData.forEach((cand, index) => {
          previewList.innerHTML += `
    <div class="list-group-item list-group-item-action d-flex align-items-center p-3 mb-2 rounded-4 border shadow-sm" 
         onclick="showCandidateDetail(${index})" style="transition: 0.2s; border-color: var(--border-color) !important;">
        <div class="position-relative">
            <img src="${getFullImageUrl(cand.foto)}" class="rounded-circle border" style="width: 55px; height: 55px; object-fit: cover; border-color: var(--border-color) !important;">
            <span class="position-absolute top-0 start-0 badge rounded-pill bg-dark" style="font-size: 0.6rem;">${cand.noUrut}</span>
        </div>
        <div class="ms-3 flex-grow-1">
            <h6 class="mb-0 fw-bold" style="color: var(--text-main);">${cand.nama}</h6>
            <small class="text-muted d-block" style="font-size: 0.75rem;">Wakil: ${cand.wakil}</small>
        </div>
        <i class="bi bi-info-circle text-primary"></i>
    </div>
`;
        });
      } catch (err) {
        console.error("Gagal load preview:", err);
      }
    }

    // 2. Tampilkan Detail ke Modal
    function showCandidateDetail(index) {
      const cand = allCandidatesData[index];
      const modal = new bootstrap.Modal(document.getElementById('candidateModal'));

      // Set Visual
      document.getElementById('modalHeaderColor').style.backgroundColor = cand.warna;
      document.getElementById('visiContainer').style.borderLeftColor = cand.warna;
      document.getElementById('misiContainer').style.borderLeftColor = cand.warna;
      document.getElementById('modalNoUrut').style.backgroundColor = cand.warna;
      document.getElementById('modalNoUrut').classList.add('text-white');

      // Set Data
      document.getElementById('modalFoto').src = getFullImageUrl(cand.foto);
      document.getElementById('modalNoUrut').innerText = `Nomor Urut ${cand.noUrut}`;
      document.getElementById('modalNamaKetua').innerText = cand.nama;
      document.getElementById('modalNamaWakil').innerText = cand.wakil;
      document.getElementById('modalTagline').innerText = `"${cand.tagline}"`;
      document.getElementById('modalVisi').innerText = cand.visi;

      // Render Misi (Array)
      const misiList = document.getElementById('modalMisi');
      misiList.innerHTML = '';
      if (Array.isArray(cand.misi)) {
        cand.misi.forEach(m => {
          misiList.innerHTML += `<li>${m}</li>`;
        });
      }

      modal.show();
    }

    // === Inisialisasi ===
    showStage('mainPage');

    const touchBtn = document.getElementById('theme-touch');
    const themeIcon = document.getElementById('theme-icon');

    let isDragging = false;
    let startX, startY, initialX, initialY;

    // --- LOGIKA THEME ---
    // Fungsi untuk update ikon saja (tanpa animasi)
    function updateIconOnly(theme) {
      if (theme === 'dark') {
        themeIcon.classList.replace('bi-sun-fill', 'bi-moon-stars-fill');
      } else {
        themeIcon.classList.replace('bi-moon-stars-fill', 'bi-sun-fill');
      }
    }

    // Fungsi untuk apply tema dengan animasi (untuk Klik Manual)
    function applyTheme(theme, animate = true) {
      if (!animate) {
        document.documentElement.setAttribute('data-theme', theme);
        updateIconOnly(theme);
        return;
      }

      // Animasi keluar
      themeIcon.style.transform = "rotate(180deg) scale(0)";
      themeIcon.style.opacity = "0";

      setTimeout(() => {
        document.documentElement.setAttribute('data-theme', theme);
        updateIconOnly(theme);

        // Animasi masuk
        themeIcon.style.transform = "rotate(0deg) scale(1)";
        themeIcon.style.opacity = "1";

        localStorage.setItem('theme-preference', theme);
      }, 200);
    }

    // --- FITUR REAL-TIME SYSTEM SYNC ---
    const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleSystemThemeChange(e) {
      // Hanya ganti otomatis jika user belum pernah mengatur secara manual
      if (!localStorage.getItem('theme-preference')) {
        const newTheme = e.matches ? 'dark' : 'light';
        applyTheme(newTheme, false); // false = tanpa animasi transisi ikon agar tidak mengganggu
      }
    }

    // Pasang listener untuk perubahan sistem (Real-time)
    darkModeMediaQuery.addEventListener('change', handleSystemThemeChange);

    // --- INISIALISASI AWAL ---
    function initTheme() {
      const savedTheme = localStorage.getItem('theme-preference');
      const systemTheme = darkModeMediaQuery.matches ? 'dark' : 'light';
      const finalTheme = savedTheme || systemTheme;

      // Terapkan instan tanpa animasi agar tidak splash
      applyTheme(finalTheme, false);

      // Berikan sedikit jeda lalu aktifkan transisi CSS agar klik selanjutnya smooth
      setTimeout(() => {
        document.documentElement.classList.add('loaded');
      }, 100);
    }

    // Jalankan init
    initTheme();

    // --- LOGIKA DRAG (Mobile & Desktop) ---
    touchBtn.addEventListener('pointerdown', (e) => {
      isDragging = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = touchBtn.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;

      touchBtn.setPointerCapture(e.pointerId);
    });

    touchBtn.addEventListener('pointermove', (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        isDragging = true;

        // Hitung posisi baru
        let newX = initialX + dx;
        let newY = initialY + dy;

        // Batas-batas layar (clamping)
        const padding = 15; // Jarak aman dari pinggir
        const maxX = window.innerWidth - touchBtn.offsetWidth - padding;
        const maxY = window.innerHeight - touchBtn.offsetHeight - padding;

        // Terapkan pembatasan agar tidak keluar frame
        newX = Math.max(padding, Math.min(newX, maxX));
        newY = Math.max(padding, Math.min(newY, maxY));

        touchBtn.style.left = `${newX}px`;
        touchBtn.style.top = `${newY}px`;
        touchBtn.style.bottom = 'auto';
        touchBtn.style.right = 'auto';
      }
    });

    touchBtn.addEventListener('pointerup', (e) => {
      if (!isDragging) {
        // Jika hanya diklik (bukan digeser), ganti tema
        const currentTheme = document.documentElement.getAttribute('data-theme');
        applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
      }

      // Opsional: Magnetik (tombol akan nempel ke sisi terdekat)
      const windowWidth = window.innerWidth;
      const rect = touchBtn.getBoundingClientRect();
      if (rect.left + rect.width / 2 < windowWidth / 2) {
        touchBtn.style.left = '15px';
      } else {
        touchBtn.style.left = (windowWidth - rect.width - 15) + 'px';
      }
    });