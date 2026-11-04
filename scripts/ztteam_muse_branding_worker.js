/**
 * ZTTeam: Dịch vụ nền tạo Ảnh Bìa & Avatar Facebook tự động qua Muse.ai
 * Tác giả: ZTTeam (t7.goxo.us)
 * Cổng Chrome Debugger chuyên biệt: 9245 (hoặc chỉ định qua --chrome-port)
 * Profile Chrome chuyên biệt: %USERPROFILE%\chrome-muse-branding-profile
 * Tránh hoàn toàn xung đột cổng với các worker Reel/Video khác.
 */

const fs = require('fs');
const path = require('path');

function smartRequire(name) {
  try {
    return require(name);
  } catch (e) {
    const candidates = [
      path.resolve(__dirname, '../node_modules', name),
      path.resolve('D:/projects/t7.goxo.us/node_modules', name),
      path.resolve('D:/projects/t4.goxo.us/node_modules', name),
      path.resolve('D:/projects/t4-reel/node_modules', name),
      path.resolve('D:/projects/trung-reel/node_modules', name),
      path.resolve('D:/projects/linh.goxo.us/node_modules', name),
    ];
    for (const c of candidates) {
      try {
        return require(c);
      } catch (err) {}
    }
    throw e;
  }
}

let puppeteer;
try {
  puppeteer = smartRequire('puppeteer-core');
} catch (e1) {
  try {
    puppeteer = smartRequire('puppeteer');
  } catch (e2) {
    console.error('\n❌ LỖI: Chưa tìm thấy thư viện puppeteer-core hoặc puppeteer!');
    process.exit(1);
  }
}

const axios = smartRequire('axios');
const FormData = smartRequire('form-data');

/** Đọc tham số dòng lệnh */
const args = process.argv.slice(2);

const targetArg = args.find(a => a.startsWith('--target='));
const TARGET_URL = (targetArg ? targetArg.split('=')[1] : (process.env.TARGET_URL || 'https://t7.goxo.us')).replace(/\/$/, '');

const chromePortArg = args.find(a => a.startsWith('--chrome-port='));
const CHROME_PORT = chromePortArg ? chromePortArg.split('=')[1] : (process.env.CHROME_DEBUG_PORT || '9245');
const CHROME_DEBUG_URL = `http://127.0.0.1:${CHROME_PORT}`;

const workerNameArg = args.find(a => a.startsWith('--worker-name='));
const WORKER_NAME = workerNameArg ? workerNameArg.split('=')[1] : `Branding-Worker-${CHROME_PORT}`;

const POLL_INTERVAL_MS = 10000; /** 10 giây thăm dò hàng đợi một lần */
const TEMP_DIR = path.resolve(__dirname, `./worker_temp_branding_${CHROME_PORT}`);
const SUCCESS_COOLDOWN_SEC = 20;
const FAILURE_COOLDOWN_SEC = 20;

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

let isProcessing = false;

/** Gửi Heartbeat báo trạng thái Worker còn sống về VPS */
async function ztteam_sendHeartbeat() {
  try {
    await axios.post(`${TARGET_URL}/api/facebook/pages/branding/heartbeat`, {
      workerName: WORKER_NAME,
      chromePort: CHROME_PORT,
      status: isProcessing ? 'BUSY' : 'IDLE',
      timestamp: Date.now()
    }, { timeout: 5000 });
  } catch (err) {
    // Bỏ qua lỗi ngầm khi heartbeat
  }
}


/** Hàm đếm ngược thời gian nghỉ an toàn */
async function ztteam_cooldown(seconds, reason) {
  console.log(`\n⏳ [${WORKER_NAME}] [Nghỉ an toàn] ${reason}.`);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   ⏱️ [${WORKER_NAME}] Chờ ${i} giây trước khi tiếp tục...   `);
    await new Promise(r => setTimeout(r, 1000));
  }
  process.stdout.write('\r                                                              \r');
}

/** Kiểm tra cổng Chrome debugging có phản hồi không */
async function ztteam_isChromeRunning() {
  try {
    const res = await axios.get(`${CHROME_DEBUG_URL}/json/version`, { timeout: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Gửi prompt vào khung chat Muse.ai và kích hoạt gửi
 */
async function ztteam_sendPromptToMuse(page, promptText) {
  console.log(`✍️ [${WORKER_NAME}] Đang nhập prompt vào Muse.ai...`);
  
  /** Đóng dấu tất cả các tin nhắn, bong bóng ảnh cũ */
  await page.evaluate(() => {
    document.querySelectorAll('[data-message-author-role="assistant"], .prose, img, button.hatch-chat-groupable-bubble').forEach(el => {
      el.setAttribute('data-ztteam-old', 'true');
    });
  });

  const textarea = await page.$('textarea');
  if (!textarea) throw new Error('Không tìm thấy khung nhập liệu textarea trên Muse.ai');
  await textarea.click();

  /** Dán prompt bằng React prototype setter */
  await page.evaluate((text) => {
    const ta = document.querySelector('textarea');
    if (!ta) return;
    ta.focus();
    const proto = Object.getPrototypeOf(ta);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) {
      setter.call(ta, text);
    } else {
      ta.value = text;
    }
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    document.execCommand('insertText', false, ' ');
    document.execCommand('delete', false, null);
  }, promptText);

  await new Promise(r => setTimeout(r, 1000));

  /** Bấm nút gửi */
  console.log(`🚀 [${WORKER_NAME}] Đang bấm Gửi...`);
  const isClicked = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;

    // Tìm chính xác nút Send của Hatch Composer
    const sendBtn = document.querySelector('button[aria-label="Send"], button[data-pel-click="chat_send_message"], [data-hatch-composer-action="send"] button');
    if (sendBtn && !sendBtn.disabled) {
      sendBtn.click();
      return true;
    }

    const allButtons = Array.from(document.querySelectorAll('button'));
    let targetBtn = allButtons.find(b => {
      if (b.disabled) return false;
      if (b.closest('[aria-hidden="true"]') || b.closest('[inert]')) return false;
      const aria = (b.getAttribute('aria-label') || '').toLowerCase();
      const title = (b.getAttribute('title') || '').toLowerCase();
      const text = (b.innerText || '').toLowerCase();
      return aria.includes('gửi') || aria.includes('send') || title.includes('gửi') || title.includes('send') || text.includes('gửi') || text.includes('send');
    });

    if (targetBtn && !targetBtn.disabled) {
      targetBtn.click();
      return true;
    }
    return false;
  });

  if (!isClicked) {
    try {
      await textarea.focus();
      await page.keyboard.press('Enter');
    } catch (e) {}
  }

  /** Đánh dấu thời điểm gửi tin nhắn */
  await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    if (ta) {
      ta.setAttribute('data-ztteam-last-sent', Date.now().toString());
    }
  });

  await new Promise(r => setTimeout(r, 2000));
}

/**
 * Đợi Muse.ai tạo ảnh xong và trích xuất Buffer ảnh
 */
async function ztteam_waitForAndExtractImage(page, label, timeoutSec = 240) {
  console.log(`⏳ [${WORKER_NAME}] Đang đợi Muse.ai tạo [${label}] (tối đa ${timeoutSec}s)...`);
  const startTime = Date.now();

  while ((Date.now() - startTime) / 1000 < timeoutSec) {
    await new Promise(r => setTimeout(r, 3000));
    const elapsed = Math.round((Date.now() - startTime) / 1000);

    const checkResult = await page.evaluate(() => {
      // 1. Kiểm tra chính xác trạng thái đang sinh ảnh (isGenerating)
      // Trong Hatch Composer của Muse.ai, nút Stop nằm trong div[data-hatch-composer-action="stop"].
      // Khi rảnh rỗi (idle), container này có style="opacity: 0", inert và aria-hidden="true".
      let isGenerating = false;
      const stopContainer = document.querySelector('[data-hatch-composer-action="stop"]');
      if (stopContainer) {
        const isAriaHidden = stopContainer.getAttribute('aria-hidden') === 'true';
        const isInert = stopContainer.hasAttribute('inert');
        const style = window.getComputedStyle(stopContainer);
        isGenerating = !isAriaHidden && !isInert && style.opacity !== '0' && style.display !== 'none' && style.visibility !== 'hidden';
      } else {
        const stopBtn = document.querySelector('button[aria-label="Stop"], button[data-testid="hatch-composer-stop-button"]');
        if (stopBtn) {
          const isAriaHidden = stopBtn.closest('[aria-hidden="true"]') !== null;
          const isInert = stopBtn.closest('[inert]') !== null;
          const style = window.getComputedStyle(stopBtn);
          isGenerating = !isAriaHidden && !isInert && style.opacity !== '0' && style.display !== 'none';
        }
      }

      // 2. Tìm ảnh mới xuất hiện (loại trừ các ảnh cũ đã đánh dấu data-ztteam-old)
      const allImgs = Array.from(document.querySelectorAll('img')).filter(img => {
        // Bỏ qua avatar nhỏ của user hoặc trợ lý
        if (img.closest('.rounded-full')) return false;
        if (img.width > 0 && img.width <= 48 && img.height > 0 && img.height <= 48) return false;
        if (img.getAttribute('data-ztteam-old') === 'true') return false;
        if (!img.src) return false;
        return true;
      });

      let foundImgSrc = null;
      let imgDimensions = null;
      if (allImgs.length > 0) {
        const latestImg = allImgs[allImgs.length - 1];
        foundImgSrc = latestImg.src;
        imgDimensions = {
          w: latestImg.width,
          h: latestImg.height,
          nw: latestImg.naturalWidth,
          nh: latestImg.naturalHeight
        };
      }

      return {
        isGenerating,
        foundImgSrc,
        imgDimensions,
        totalNewImgs: allImgs.length
      };
    });

    process.stdout.write(`\r   ⏱️ [${WORKER_NAME}] [${label}] Đang tạo: ${elapsed}s | Sinh ảnh: ${checkResult.isGenerating ? 'ĐANG CHẠY' : 'ĐÃ DỪNG'} | Phát hiện ảnh: ${checkResult.foundImgSrc ? 'CÓ (' + (checkResult.imgDimensions?.nw || checkResult.imgDimensions?.w || 'OK') + 'px)' : 'Chưa'}...   `);

    // Điều kiện hoàn tất an toàn:
    // Có ảnh mới VÀ (Muse đã dừng sinh HOẶC sau 45s đã có ảnh lớn hoàn chỉnh >= 400px)
    const hasValidImage = checkResult.foundImgSrc && (!checkResult.imgDimensions || checkResult.imgDimensions.nw >= 300 || checkResult.imgDimensions.w >= 150);

    if (hasValidImage && (!checkResult.isGenerating || elapsed >= 45) && elapsed >= 8) {
      console.log(`\n🎉 [${WORKER_NAME}] Đã hoàn tất tạo [${label}] sau ${elapsed} giây!`);
      
      /** Trích xuất dữ liệu ảnh */
      const base64Data = await page.evaluate(async (src) => {
        try {
          if (src.startsWith('data:image/')) return src;
          const res = await fetch(src);
          const blob = await res.blob();
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
          });
        } catch (e) {
          return null;
        }
      }, checkResult.foundImgSrc);

      if (base64Data && base64Data.includes(',')) {
        const base64Part = base64Data.split(',')[1];
        return Buffer.from(base64Part, 'base64');
      }

      /** Dự phòng: Tìm phần tử ảnh để chụp screenshot */
      console.log(`📸 [${WORKER_NAME}] Sử dụng dự phòng screenshot phần tử ảnh...`);
      const imgHandle = await page.$('img:not([data-ztteam-old="true"]):not(.rounded-full)');
      if (imgHandle) {
        return await imgHandle.screenshot({ type: 'png' });
      }
    }
  }

  throw new Error(`Quá thời gian chờ tạo [${label}] trên Muse.ai (${timeoutSec}s)`);
}

/**
 * Xử lý 1 Branding Job cho 1 Fanpage
 */
async function ztteam_processBrandingJob(job) {
  const pageId = job.pageId || job.id;
  const pageName = job.pageName || job.name || 'Fanpage';
  const fbPageId = job.fbPageId || job.fb_page_id || job.pageFbId || 'N/A';
  const autoApply = (job.autoApply !== undefined) ? job.autoApply : ((job.autoApplyFacebook !== undefined) ? job.autoApplyFacebook : true);

  console.log(`\n========================================================`);
  console.log(`🎨 [${WORKER_NAME}] BẮT ĐẦU JOB TẠO BRANDING FANPAGE`);
  console.log(`📛 Tên Fanpage : ${pageName}`);
  console.log(`🆔 ID Facebook : ${fbPageId}`);
  console.log(`🔑 Job UUID    : ${pageId}`);
  console.log(`🎯 Loại Cần Tạo: ${job.type} (${job.theme || 'Mặc định'})`);
  console.log(`⚡ Tự Áp Dụng  : ${autoApply ? 'BẬT (Meta Graph API)' : 'TẮT (Chỉ lưu vào hệ thống)'}`);
  console.log(`========================================================`);

  const localAvatarPath = path.join(TEMP_DIR, `avatar_${pageId}.png`);
  const localCoverPath = path.join(TEMP_DIR, `cover_${pageId}.png`);

  let browser = null;
  let page = null;

  try {
    /** 1. Kết nối Chrome qua Remote Debugging Port */
    console.log(`🌐 [${WORKER_NAME}] Đang kết nối tới Chrome (${CHROME_DEBUG_URL})...`);
    browser = await puppeteer.connect({
      browserURL: CHROME_DEBUG_URL,
      defaultViewport: null,
      protocolTimeout: 300000,
    });

    const pages = await browser.pages();
    page = pages.find(p => p.url().includes('muse.ai')) || pages[0];
    if (!page) {
      page = await browser.newPage();
    }
    await page.bringToFront();

    let avatarGenerated = false;
    let coverGenerated = false;

    /** 2. Tạo Avatar nếu yêu cầu */
    if (job.type === 'avatar' || job.type === 'both') {
      console.log(`\n🖼️ [${WORKER_NAME}] [1/2] Tiến hành tạo Ảnh Đại Diện (Avatar) cho "${pageName}"...`);
      /** Reset tab Muse để giải phóng RAM & sạch dữ liệu cũ */
      await page.goto('https://muse.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('textarea', { timeout: 25000 });
      await new Promise(r => setTimeout(r, 2000));

      const avatarPrompt = (job.avatarPrompt || `Thiết kế ảnh đại diện (avatar icon) hình vuông tỉ lệ 1:1 cho fanpage "${pageName}", phong cách chuyên nghiệp, hiện đại, sắc nét 4K 1024x1024`).replace(/\{PAGE_NAME\}/g, pageName);
      
      await ztteam_sendPromptToMuse(page, avatarPrompt);
      const avatarBuffer = await ztteam_waitForAndExtractImage(page, 'Avatar', 240);
      fs.writeFileSync(localAvatarPath, avatarBuffer);
      console.log(`💾 [${WORKER_NAME}] Đã lưu Avatar tạm: ${localAvatarPath} (${Math.round(avatarBuffer.length / 1024)} KB)`);
      avatarGenerated = true;

      /** Lưu lũy tiến Avatar lên máy chủ ngay để đảm bảo không mất dữ liệu */
      if (job.type === 'both') {
        try {
          console.log(`📤 [${WORKER_NAME}] [Lưu tiến độ] Đang gửi trước Avatar lên VPS...`);
          const partialForm = new FormData();
          partialForm.append('avatar', fs.createReadStream(localAvatarPath));
          partialForm.append('stage', 'avatar');
          partialForm.append('partial', 'true');
          partialForm.append('autoApply', autoApply ? 'true' : 'false');
          await axios.post(
            `${TARGET_URL}/api/facebook/pages/branding/${pageId}/attach-result`,
            partialForm,
            { headers: partialForm.getHeaders(), timeout: 60000 }
          );
          console.log(`✅ [${WORKER_NAME}] Đã lưu trước Avatar thành công vào hệ thống!`);
        } catch (partialErr) {
          console.warn(`⚠️ [${WORKER_NAME}] Lưu Avatar lũy tiến gặp lỗi nhỏ (sẽ gộp ở bước cuối): ${partialErr.message}`);
        }
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    /** 3. Tạo Cover nếu yêu cầu */
    if (job.type === 'cover' || job.type === 'both') {
      console.log(`\n🖼️ [${WORKER_NAME}] [2/2] Tiến hành tạo Ảnh Bìa (Cover Banner) cho "${pageName}"...`);
      /** Đảm bảo tab Muse sẵn sàng cho Cover (giữ ngữ cảnh chat nếu đã có textarea) */
      const hasTextarea = await page.$('textarea').catch(() => null);
      if (!hasTextarea) {
        await page.goto('https://muse.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.waitForSelector('textarea', { timeout: 25000 });
      }
      await new Promise(r => setTimeout(r, 2000));

      const coverPrompt = (job.coverPrompt || `Thiết kế ảnh bìa (cover banner) Facebook ngang tỉ lệ 16:9 (1920x1080) cho fanpage "${pageName}", chủ đề hấp dẫn, bố cục cân đối chừa khoảng trống cho avatar`).replace(/\{PAGE_NAME\}/g, pageName);
      
      await ztteam_sendPromptToMuse(page, coverPrompt);
      const coverBuffer = await ztteam_waitForAndExtractImage(page, 'Cover', 240);
      fs.writeFileSync(localCoverPath, coverBuffer);
      console.log(`💾 [${WORKER_NAME}] Đã lưu Cover tạm: ${localCoverPath} (${Math.round(coverBuffer.length / 1024)} KB)`);
      coverGenerated = true;
    }

    /** 4. Upload kết quả lên VPS qua /attach-result */
    console.log(`\n📤 [${WORKER_NAME}] Đang tải ảnh thành phẩm lên máy chủ VPS (${TARGET_URL})...`);
    const formData = new FormData();
    formData.append('autoApply', autoApply ? 'true' : 'false');
    formData.append('partial', 'false');
    formData.append('stage', job.type || 'both');

    if (avatarGenerated && fs.existsSync(localAvatarPath)) {
      formData.append('avatar', fs.createReadStream(localAvatarPath));
    }
    if (coverGenerated && fs.existsSync(localCoverPath)) {
      formData.append('cover', fs.createReadStream(localCoverPath));
    }

    const uploadRes = await axios.post(
      `${TARGET_URL}/api/facebook/pages/branding/${pageId}/attach-result`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000,
      }
    );

    console.log(`========================================================`);
    console.log(`🎉 HOÀN TẤT THÀNH CÔNG JOB CHO PAGE: [${pageName}]!`);
    const resData = uploadRes.data?.data || uploadRes.data || {};
    console.log(`🖼️ Avatar URL : ${resData.avatarUrl || 'N/A'}`);
    console.log(`🖼️ Cover URL  : ${resData.coverUrl || 'N/A'}`);
    console.log(`⚡ Meta Apply : ${resData.appliedFacebook ? 'THÀNH CÔNG' : (resData.applyMessage || 'Chưa áp dụng')}`);
    console.log(`========================================================\n`);

    await ztteam_cooldown(SUCCESS_COOLDOWN_SEC, `Hoàn tất branding Fanpage "${pageName}". Tạm nghỉ`);
  } catch (err) {
    console.error(`\n❌ [${WORKER_NAME}] LỖI XỬ LÝ JOB CHO PAGE "${pageName}" (#${pageId}):`, err.message);

    /** Báo lỗi về server để giải phóng hàng đợi */
    try {
      await axios.post(`${TARGET_URL}/api/facebook/pages/branding/${pageId}/reset`, {
        error: err.message
      });
      console.log(`⚠️ [${WORKER_NAME}] Đã chuyển trạng thái FAILED trên máy chủ.`);
    } catch (e) {
      console.error(`[${WORKER_NAME}] Không thể gửi reset lên VPS:`, e.message);
    }

    await ztteam_cooldown(FAILURE_COOLDOWN_SEC, 'Gặp lỗi trong quá trình tạo ảnh. Tạm nghỉ');
  } finally {
    if (browser) {
      try { browser.disconnect(); } catch (e) {}
    }
    if (fs.existsSync(localAvatarPath)) {
      try { fs.unlinkSync(localAvatarPath); } catch (e) {}
    }
    if (fs.existsSync(localCoverPath)) {
      try { fs.unlinkSync(localCoverPath); } catch (e) {}
    }
  }
}

/** Vòng lặp chính của Branding Worker */
async function ztteam_brandingWorkerLoop() {
  if (isProcessing) return;

  try {
    const isChromeAlive = await ztteam_isChromeRunning();
    if (!isChromeAlive) {
      process.stdout.write(`\r⏳ [${WORKER_NAME}] Đang chờ mở Chrome tại ${CHROME_DEBUG_URL}... (Chạy start_chrome_branding_muse.bat)   `);
      return;
    }

    /** Thăm dò job từ VPS */
    let pendingRes;
    try {
      pendingRes = await axios.get(`${TARGET_URL}/api/facebook/pages/branding/pending-job`, { timeout: 10000 });
    } catch (apiErr) {
      process.stdout.write(`\r⚠️ [${WORKER_NAME}] Không thể kết nối VPS (${TARGET_URL}): ${apiErr.message}   `);
      return;
    }

    if (pendingRes.data?.job) {
      isProcessing = true;
      try {
        await ztteam_processBrandingJob(pendingRes.data.job);
      } finally {
        isProcessing = false;
      }
    } else {
      process.stdout.write(`\r💤 [${WORKER_NAME}] Hàng đợi trống. Đang chờ job mới từ VPS (${TARGET_URL})...   `);
    }
  } catch (err) {
    console.error(`\n[${WORKER_NAME}] Lỗi vòng lặp worker:`, err.message);
  }
}

/** Khởi động worker */
console.log(`========================================================`);
console.log(`🚀 ZTTEAM - MUSE BRANDING WORKER (AVATAR & COVER)`);
console.log(`🌐 Máy chủ VPS : ${TARGET_URL}`);
console.log(`🔌 Cổng Chrome : ${CHROME_DEBUG_URL}`);
console.log(`📂 Thư mục tạm : ${TEMP_DIR}`);
console.log(`========================================================\n`);

// Bật gửi Heartbeat định kỳ 15 giây
setInterval(ztteam_sendHeartbeat, 15000);
ztteam_sendHeartbeat();

setInterval(ztteam_brandingWorkerLoop, POLL_INTERVAL_MS);
ztteam_brandingWorkerLoop();

