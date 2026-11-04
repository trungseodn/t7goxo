/**
 * ZTTeam: D?ch v? n?n t? d?ng hóa Muse.ai (Local Worker Ða Lu?ng & Ch?ng Trùng L?p)
 * Tác gi?: ZTTeam (ztteam.site)
 * H? tr? da lu?ng Chrome d?c l?p, ch?ng dán th?a ?nh, ch?ng tràn RAM/DOM Leak
 */
let puppeteer;
try {
  puppeteer = require('puppeteer-core');
} catch (e1) {
  try {
    puppeteer = require('puppeteer');
  } catch (e2) {
    console.error('\n? L?I: Chua cài d?t thu vi?n puppeteer-core ho?c puppeteer!');
    console.error('?? Vui lòng m? CMD t?i thu m?c này và ch?y l?nh:');
    console.error('   npm install puppeteer-core axios form-data\n');
    process.exit(1);
  }
}
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

/** H? tr? c?u hình m?c tiêu d?ng qua tham s? dòng l?nh ho?c bi?n môi tru?ng */
const args = process.argv.slice(2);
const targetArg = args.find(a => a.startsWith('--target='));
const customTargetUrl = targetArg ? targetArg.split('=')[1] : process.env.TARGET_URL;

let VPS_TARGETS = [];
if (customTargetUrl) {
  const cleanUrl = customTargetUrl.replace(/\/$/, '');
  VPS_TARGETS = [
    { id: 'custom_target', name: cleanUrl, url: cleanUrl }
  ];
} else {
  VPS_TARGETS = [
    { id: 'auto_ztteam', name: 'auto.ztteam.site', url: process.env.AUTO_ZTTEAM_URL || 'http://169.58.122.248:3000' },
    { id: 'didinao',     name: 'reel.didinao.com', url: process.env.DIDINAO_URL     || 'http://169.58.122.248:3001' },
  ];
}

let currentTargetIndex = 0;
const chromePortArg = args.find(a => a.startsWith('--chrome-port='));
const customChromePort = chromePortArg ? chromePortArg.split('=')[1] : null;
const CHROME_DEBUG_URL = customChromePort
  ? `http://127.0.0.1:${customChromePort}`
  : (process.env.CHROME_DEBUG_URL || 'http://127.0.0.1:9222');

const workerNameArg = args.find(a => a.startsWith('--worker-name='));
const WORKER_NAME = workerNameArg 
  ? workerNameArg.split('=')[1] 
  : (customChromePort ? `Acc-${customChromePort}` : 'Acc-Chinh');

const POLL_INTERVAL_MS = 15000; /** 15 giây ki?m tra hàng d?i m?t l?n */
const TEMP_DIR = path.resolve(__dirname, `./worker_temp_${customChromePort || 'default'}`);
const SUCCESS_COOLDOWN_SEC = 45; /** Ngh? 45 giây sau khi t?o thành công 1 video */
const FAILURE_COOLDOWN_SEC = 45; /** Ngh? 45 giây n?u bài g?p l?i d? Muse ?n d?nh */

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/** Bi?n c? ngan ch?n ch?y song song nhi?u job trên cùng 1 worker instance */
let isProcessing = false;

/** Hàm d?m ngu?c th?i gian ngh? an toàn */
async function ztteam_cooldown(seconds, reason) {
  console.log(`\n? [${WORKER_NAME}] [Ngh? an toàn] ${reason}.`);
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`\r   ?? [${WORKER_NAME}] Ðang ch? ${i} giây tru?c khi ti?p t?c...   `);
    await new Promise(r => setTimeout(r, 1000));
  }
  process.stdout.write('\r                                                              \r');
}

/** Hàm t?i file t? URL v? máy tính */
async function ztteam_downloadFile(url, destPath, targetBaseUrl) {
  const fullUrl = url.startsWith('http') ? url : `${targetBaseUrl}${url}`;
  const response = await axios({
    url: fullUrl,
    method: 'GET',
    responseType: 'stream',
    timeout: 30000,
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/** Hàm ki?m tra c?ng Chrome debugging có dang m? không */
async function ztteam_isChromeRunning() {
  try {
    const res = await axios.get(`${CHROME_DEBUG_URL}/json/version`, { timeout: 2000 });
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Hàm th?c thi render 1 video trên Muse.ai v?i b?o v? dán d?n ?nh và gi?i phóng RAM */
async function ztteam_processVideoJobOnMuse(job, target) {
  console.log(`\n========================================================`);
  console.log(`?? [${WORKER_NAME}] B?T Ð?U X? LÝ JOB T?O REEL: #${job.id}`);
  console.log(`?? H? th?ng : ${target.name} (${target.url})`);
  console.log(`?? Tiêu d?  : ${job.title}`);
  console.log(`========================================================`);

  const localImagePath = path.join(TEMP_DIR, `job_img_${job.id}.png`);
  const localVideoPath = path.join(TEMP_DIR, `job_vid_${job.id}.mp4`);

  let browser = null;
  let page = null;

  try {
    let videoRendered = false;
    let base64Data = null;

    /** 1. K?t n?i Chrome */
    console.log(`?? [${WORKER_NAME}] [1/4] Ðang k?t n?i t?i Chrome (${CHROME_DEBUG_URL})...`);
    browser = await puppeteer.connect({
      browserURL: CHROME_DEBUG_URL,
      defaultViewport: null,
      protocolTimeout: 600000, /** 10 phút timeout CDP */
    });

    const pages = await browser.pages();
    page = pages.find(p => p.url().includes('muse.ai')) || pages[0];
    if (!page) {
      console.log(`?? [${WORKER_NAME}] M? tab Muse.ai m?i...`);
      page = await browser.newPage();
    }
    await page.bringToFront();

    /** 2. B?O V? CH?NG TRÀN RAM & XÓA S?CH ?NH CU TRONG REACT STATE:
     * T? d?ng di?u hu?ng v? https://muse.ai/ tru?c m?i job m?i
     * Thao tác này h?y b? toàn b? video cu trong DOM, gi?i phóng 3GB RAM v? 100MB, và làm s?ch 100% ?nh sót l?i
     */
    console.log(`?? [${WORKER_NAME}] Ðang làm m?i tab Muse.ai d? gi?i phóng RAM & xóa s?ch ?nh cu...`);
    await page.goto('https://muse.ai/', { waitUntil: 'domcontentloaded', timeout: 45000 });

    /** Ch? khung nh?p li?u s?n sàng */
    await page.waitForSelector('textarea', { timeout: 25000 });
    await new Promise(r => setTimeout(r, 1500));

    /** T?i ?nh hi?n t?i c?a job t? VPS v? máy tính */
    if (fs.existsSync(localImagePath)) {
      try { fs.unlinkSync(localImagePath); } catch (e) {}
    }
    console.log(`?? [${WORKER_NAME}] Ðang t?i ?nh t? ${target.name}: ${job.imageUrl}`);
    await ztteam_downloadFile(job.imageUrl, localImagePath, target.url);
    console.log(`? [${WORKER_NAME}] Ðã luu ?nh t?m t?i: ${localImagePath}`);

    /** 3. B?O V? 2 L?P CH?NG L?I DÁN D?N 3 - 5 ?NH VÀO KHUNG CHAT:
     * L?p 1: Quét d?n s?ch s? t?t c? m?i nút dóng/xóa ?nh n?u có tru?c khi upload
     */
    console.log(`?? [${WORKER_NAME}] Ðang quét d?n khung chat d? d?m b?o không còn ?nh sót l?i...`);
    await page.evaluate(() => {
      const allButtons = Array.from(document.querySelectorAll('button'));
      const removeButtons = allButtons.filter(btn => {
        const hasImg = btn.closest('div')?.querySelector('img') !== null;
        const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
        const isRemove = ariaLabel.includes('xóa') || ariaLabel.includes('delete') || ariaLabel.includes('remove') || ariaLabel.includes('close');
        return hasImg || isRemove;
      });
      removeButtons.forEach(b => {
        try { b.click(); } catch (e) {}
      });
    });
    await new Promise(r => setTimeout(r, 600));

    /** Ch?n dúng th? input file c?a khung chat */
    const fileInputs = await page.$$('input[type="file"]');
    if (!fileInputs || fileInputs.length === 0) throw new Error('Không tìm th?y input[type="file"] trên Muse.ai');
    const chatFileInput = fileInputs.length > 1 ? fileInputs[fileInputs.length - 1] : fileInputs[0];
    
    console.log(`?? [${WORKER_NAME}] Ðang dính kèm ?nh duy nh?t c?a bài vi?t vào khung chat...`);
    await chatFileInput.uploadFile(localImagePath);
    await new Promise(r => setTimeout(r, 3000));

    /** L?p 2: KI?M TRA NGHIÊM NG?T S? LU?NG ?NH SAU KHI UPLOAD
     * Ð?m b?o chính xác 1 ?nh duy nh?t, n?u có nhi?u hon 1 thì l?p t?c xóa b? các ?nh th?a
     */
    const postUploadCheck = await page.evaluate(() => {
      const form = document.querySelector('textarea')?.closest('form') || document.querySelector('textarea')?.closest('div.relative') || document.body;
      const previewImgs = Array.from(form.querySelectorAll('img')).filter(img => {
        const isAvatar = img.closest('.rounded-full') !== null || img.width <= 36 || img.height <= 36;
        return !isAvatar;
      });
      return {
        count: previewImgs.length,
      };
    });

    if (postUploadCheck.count > 1) {
      console.warn(`?? [${WORKER_NAME}] C?NH BÁO: Phát hi?n ${postUploadCheck.count} ?nh trong khung chat! Ðang ti?n hành lo?i b? các ?nh th?a...`);
      await page.evaluate(() => {
        const form = document.querySelector('textarea')?.closest('form') || document.querySelector('textarea')?.closest('div.relative') || document.body;
        const removeBtns = Array.from(form.querySelectorAll('button')).filter(btn => {
          return btn.closest('div')?.querySelector('img') !== null;
        });
        /** Xóa t? d?u d?n tru?c ?nh cu?i cùng d? gi? l?i dúng 1 ?nh m?i nh?t */
        for (let i = 0; i < removeBtns.length - 1; i++) {
          try { removeBtns[i].click(); } catch (e) {}
        }
      });
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log(`? [${WORKER_NAME}] Ðã xác nh?n khung chat ch? có ÐÚNG 1 ?nh chu?n.`);

    /** 4. ÐÓNG D?U DOM (DATA-ZTTEAM-OLD): Ðánh d?u 100% video, nút t?i và tin nh?n cu d? tuy?t d?i không nh?n nh?m */
    console.log(`??? [${WORKER_NAME}] Ðang dóng d?u DOM các video và nút t?i cu tru?c khi g?i prompt...`);
    await page.evaluate(() => {
      document.querySelectorAll('video, button[aria-label="T?i video xu?ng"], [data-message-author-role="assistant"], .prose').forEach(el => {
        el.setAttribute('data-ztteam-old', 'true');
      });
    });

    /** 5. Dán prompt duy nh?t 1 l?n và b?m g?i */
    console.log(`?? [${WORKER_NAME}] Ðang dán câu l?nh & n?i dung câu chuy?n...`);
    const textarea = await page.$('textarea');
    if (!textarea) throw new Error('Không tìm th?y ô textarea d? nh?p prompt');
    await textarea.click();

    /** Dán toàn b? n?i dung qua React prototype setter k?t h?p execCommand d? kích ho?t d?y d? s? ki?n */
    await page.evaluate((fullPrompt) => {
      const ta = document.querySelector('textarea');
      if (!ta) return;
      ta.focus();
      const proto = Object.getPrototypeOf(ta);
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(ta, fullPrompt);
      } else {
        ta.value = fullPrompt;
      }
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      document.execCommand('insertText', false, ' ');
      document.execCommand('delete', false, null);
    }, job.prompt);
    await new Promise(r => setTimeout(r, 1000));

    console.log(`?? [${WORKER_NAME}] Ðang b?m g?i tin nh?n...`);
    await page.evaluate(() => {
      const ta = document.querySelector('textarea');
      if (!ta) return false;

      const allButtons = Array.from(document.querySelectorAll('button'));
      /** 1. Tìm nút có nhãn G?i ho?c Send */
      let targetBtn = allButtons.find(b => {
        if (b.disabled) return false;
        const aria = (b.getAttribute('aria-label') || '').toLowerCase();
        const title = (b.getAttribute('title') || '').toLowerCase();
        const text = (b.innerText || '').toLowerCase();
        return aria.includes('g?i') || aria.includes('send') || title.includes('g?i') || title.includes('send') || text.includes('g?i') || text.includes('send');
      });

      /** 2. N?u không có nhãn, tìm nút tròn ch?a SVG n?m trong ho?c g?n khung nh?p li?u */
      if (!targetBtn && ta.parentElement) {
        let parent = ta.parentElement;
        for (let i = 0; i < 5 && parent; i++) {
          const btns = Array.from(parent.querySelectorAll('button'));
          for (const b of btns) {
            if (b.disabled) continue;
            const aria = (b.getAttribute('aria-label') || '').toLowerCase();
            if (aria.includes('dính kèm') || aria.includes('attach') || aria.includes('xóa') || aria.includes('close') || b.querySelector('input[type="file"]')) {
              continue;
            }
            if (b.querySelector('svg')) {
              targetBtn = b;
              break;
            }
          }
          if (targetBtn) break;
          parent = parent.parentElement;
        }
      }

      if (targetBtn && !targetBtn.disabled) {
        targetBtn.click();
        return true;
      }
      return false;
    });

    /** Vòng l?p xác nh?n tin nh?n dã th?c s? du?c g?i di */
    let ztteam_isSent = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 1200));
      const textareaContent = await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        return ta ? ta.value.trim() : '';
      });

      if (!textareaContent) {
        ztteam_isSent = true;
        console.log(`? [${WORKER_NAME}] Ðã xác nh?n tin nh?n dã g?i di (khung chat dã s?ch)!`);
        break;
      }

      console.log(`?? [${WORKER_NAME}] Tin nh?n chua bay (th? kích ho?t l?i l?n ${attempt + 1}/5)...`);
      await page.evaluate(() => {
        const ta = document.querySelector('textarea');
        if (ta) ta.focus();
      });

      if (attempt % 2 === 0) {
        await page.keyboard.down('Control');
        await page.keyboard.press('Enter');
        await page.keyboard.up('Control');
      } else {
        await page.keyboard.press('Enter');
      }
    }

    /** 6. ÐÁNH D?U RANH GI?I TIN NH?N V?A G?I: Ch? l?y video xu?t hi?n SAU tin nh?n này */
    await page.evaluate((promptSnippet) => {
      const allDivs = Array.from(document.querySelectorAll('[data-message-author-role="user"], div'));
      const promptDiv = allDivs.find(d => {
        const txt = (d.innerText || '');
        return txt.includes(promptSnippet) && !d.querySelector('textarea');
      });
      if (promptDiv) {
        promptDiv.setAttribute('data-ztteam-user-prompt', 'true');
      }
    }, job.prompt.slice(0, 30));

    /** 7. Ch? Muse.ai render xong video 15s (T?i thi?u 25s, t?i da 7 phút) */
    const timeoutMs = 420000; /** 7 phút t?i da */
    const MIN_RENDER_SECONDS = 25; /** B?t bu?c ch? ít nh?t 25 giây th?c t? d? lo?i tr? k?t thúc non */
    console.log(`? [${WORKER_NAME}] [2/4] Ðang ch? Muse.ai render video m?i (t?i thi?u 25s, t?i da 7 phút)...`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      await new Promise(r => setTimeout(r, 4000));
      const elapsedSec = Math.round((Date.now() - startTime) / 1000);

      const check = await page.evaluate((minSec, elapsed) => {
        const refusalKeywords = [
          'không t?o du?c video',
          'g?i ?nh khác nhé',
          'không th? t?o video',
          'vi ph?m chính sách',
          'n?i dung này không phù h?p',
          'th? l?i v?i ?nh khác',
          'l?i t?o video'
        ];

        /** 1. Quét t? ch?i: Ch? xét các tin nh?n m?i (không có data-ztteam-old="true") */
        const assistantBubbles = Array.from(document.querySelectorAll('[data-message-author-role="assistant"], .prose')).filter(el => {
          return el.getAttribute('data-ztteam-old') !== 'true';
        });

        let refusalError = null;
        for (const bubble of assistantBubbles) {
          const txt = (bubble.innerText || '').toLowerCase();
          const matched = refusalKeywords.find(kw => txt.includes(kw));
          if (matched) {
            refusalError = bubble.innerText.trim();
            break;
          }
        }

        /** 2. Ki?m tra c? dang t?o video (Stop button, spinner, ch? dang t?o) */
        const allButtons = Array.from(document.querySelectorAll('button'));
        const hasStopButton = allButtons.some(b => {
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          const title = (b.getAttribute('title') || '').toLowerCase();
          return aria.includes('d?ng') || aria.includes('stop') || title.includes('d?ng') || title.includes('stop');
        });

        const hasGeneratingText = assistantBubbles.some(bubble => {
          const txt = (bubble.innerText || '').toLowerCase();
          return txt.includes('dang t?o') || txt.includes('generating') || txt.includes('dang d?ng');
        });

        const isGenerating = hasStopButton || hasGeneratingText;

        /** 3. L?c video: B? avatar và B? 100% video cu dã g?n data-ztteam-old="true" */
        const allVideos = Array.from(document.querySelectorAll('video')).filter(v => {
          const isAvatar = v.closest('.rounded-full') !== null || (v.videoWidth === 480 && v.videoHeight === 480);
          return !isAvatar;
        });

        const newVideos = allVideos.filter(v => v.getAttribute('data-ztteam-old') !== 'true');

        /** Ranh gi?i DOM: N?u có data-ztteam-user-prompt, video m?i b?t bu?c ph?i n?m SAU tin nh?n v?a g?i */
        const userPromptEl = document.querySelector('[data-ztteam-user-prompt="true"]');
        const validVideos = newVideos.filter(v => {
          if (!userPromptEl) return true;
          return !!(userPromptEl.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING);
        });

        /** Ki?m tra nút t?i video M?I: Không có data-ztteam-old="true" và n?m sau user prompt */
        const newDownloadBtns = Array.from(document.querySelectorAll('button[aria-label="T?i video xu?ng"]')).filter(b => {
          if (b.getAttribute('data-ztteam-old') === 'true') return false;
          if (userPromptEl) {
            return !!(userPromptEl.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
          }
          return true;
        });

        const hasNewDownloadBtn = newDownloadBtns.length > 0;

        /** Ki?m tra video m?c tiêu m?i nh?t */
        const targetVideo = validVideos.length > 0 ? validVideos[validVideos.length - 1] : null;
        const videoDuration = targetVideo ? (targetVideo.duration || 0) : 0;
        const videoReadyState = targetVideo ? targetVideo.readyState : 0;

        /** Ði?u ki?n hoàn t?t nghiêm ng?t:
         * 1. Ðã tr?i qua ít nh?t 25 giây th?c t?
         * 2. Không còn bi?u tu?ng/ch? dang t?o (isGenerating = false)
         * 3. Có nút t?i m?i HO?C (có video m?i v?i th?i lu?ng >= 10s và readyState >= 2)
         */
        const isTimePassed = elapsed >= minSec;
        const isVideoLoaded = targetVideo && videoDuration >= 10 && videoReadyState >= 2 && !targetVideo.seeking;
        const isReady = isTimePassed && !isGenerating && (hasNewDownloadBtn || isVideoLoaded);

        return {
          isReady: !!isReady,
          isTimePassed,
          isGenerating,
          hasNewDownloadBtn,
          validVideoCount: validVideos.length,
          videoDuration,
          videoReadyState,
          refusalError,
        };
      }, MIN_RENDER_SECONDS, elapsedSec);

      if (check.refusalError) {
        console.log(`\n? [${WORKER_NAME}] Muse.ai t? ch?i: "${check.refusalError}"`);
        throw new Error(`Muse.ai t? ch?i: ${check.refusalError}`);
      }

      process.stdout.write(`\r   ?? [${WORKER_NAME}] Ðang render: ${elapsedSec}s | Video m?i: ${check.validVideoCount} | Nút t?i m?i: ${check.hasNewDownloadBtn ? 'CÓ' : 'Chua'} | Ðang t?o: ${check.isGenerating ? 'CÒN' : 'Xong'} | Th?i lu?ng: ${check.videoDuration ? check.videoDuration.toFixed(1) + 's' : '0s'} | Tr?ng thái: ${check.isReady ? 'HOÀN T?T' : 'Ðang ch?...'}`);

      if (check.isReady) {
        console.log(`\n?? [${WORKER_NAME}] Muse.ai dã render xong video m?i sau ${elapsedSec} giây!`);
        videoRendered = true;
        break;
      }
    }

    if (!videoRendered) {
      throw new Error('Quá th?i gian ch? render trên Muse.ai (timeout 7 phút)');
    }

    /** Ch? 5s d? stream buffer video blob du?c trình duy?t t?i tr?n v?n vào RAM */
    await new Promise(r => setTimeout(r, 5000));

    /** 8. Trích xu?t d? li?u video blob m?i chu?n xác (Ch? l?y video không có data-ztteam-old="true") */
    console.log(`?? [${WORKER_NAME}] [3/4] Ðang trích xu?t d? li?u video MP4 m?i...`);
    base64Data = await page.evaluate(async () => {
      const allVideos = Array.from(document.querySelectorAll('video')).filter(v => {
        const isAvatar = v.closest('.rounded-full') !== null || (v.videoWidth === 480 && v.videoHeight === 480);
        return !isAvatar && v.src;
      });

      const newVideos = allVideos.filter(v => v.getAttribute('data-ztteam-old') !== 'true');
      const userPromptEl = document.querySelector('[data-ztteam-user-prompt="true"]');
      const validVideos = newVideos.filter(v => {
        if (!userPromptEl) return true;
        return !!(userPromptEl.compareDocumentPosition(v) & Node.DOCUMENT_POSITION_FOLLOWING);
      });

      const target = validVideos.length > 0 ? validVideos[validVideos.length - 1] : (newVideos.length > 0 ? newVideos[newVideos.length - 1] : null);
      if (!target || !target.src) return null;

      try {
        const res = await fetch(target.src);
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        return null;
      }
    });

    if (!base64Data || !base64Data.startsWith('data:')) {
      throw new Error('Không d?c du?c d? li?u video stream m?i t? Muse.ai');
    }

    const buffer = Buffer.from(base64Data.split(',')[1], 'base64');
    if (buffer.length < 1.5 * 1024 * 1024) {
      throw new Error(`File video t?i v? quá nh? (${(buffer.length / 1024 / 1024).toFixed(2)} MB), video 15s tiêu chu?n ph?i trên 1.5MB.`);
    }

    fs.writeFileSync(localVideoPath, buffer);
    console.log(`? [${WORKER_NAME}] Ðã luu file video MP4 hoàn ch?nh: ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

    /** 7. Ðính kèm video lên VPS */
    console.log(`?? [${WORKER_NAME}] [4/4] Ðang t?i video lên h? th?ng ${target.name}...`);
    const formData = new FormData();
    formData.append('video', fs.createReadStream(localVideoPath));

    const uploadRes = await axios.post(`${target.url}/api/image/${job.id}/attach-video`, formData, {
      headers: { ...formData.getHeaders() },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 60000,
    });

    console.log(`========================================================`);
    console.log(`?? HOÀN T?T THÀNH CÔNG JOB #${job.id} CHO [${target.name}] T? [${WORKER_NAME}]!`);
    console.log(`?? Video URL trên h? th?ng: ${uploadRes.data.videoUrl}`);
    console.log(`========================================================\n`);

    /** Ngh? an toàn sau khi t?o thành công 1 video */
    await ztteam_cooldown(SUCCESS_COOLDOWN_SEC, 'Ðã hoàn t?t và t?i video lên VPS. D?ng ngh? tru?c khi t?o bài m?i');
  } catch (err) {
    console.error(`\n? [${WORKER_NAME}] L?I KHI X? LÝ JOB #${job.id}:`, err.message);

    /** Báo l?i lên dúng h? th?ng VPS */
    try {
      await axios.post(`${target.url}/api/image/${job.id}/fail-video`, { error: err.message });
      console.log(`?? [${WORKER_NAME}] Ðã c?p nh?t tr?ng thái FAILED lên [${target.name}].`);
    } catch (apiErr) {
      console.error(`[${WORKER_NAME}] Không th? báo l?i lên VPS:`, apiErr.message);
    }

    /** Ngh? an toàn sau khi g?p l?i */
    await ztteam_cooldown(FAILURE_COOLDOWN_SEC, 'G?p l?i trong quá trình t?o video. D?ng ngh? tru?c khi th? l?i');
  } finally {
    /** Ðóng k?t n?i Puppeteer an toàn sau m?i job */
    if (browser) {
      try { browser.disconnect(); } catch (e) {}
    }
    /** D?n d?p file t?m trên máy tính */
    if (fs.existsSync(localImagePath)) {
      try { fs.unlinkSync(localImagePath); } catch (e) {}
    }
    if (fs.existsSync(localVideoPath)) {
      try { fs.unlinkSync(localVideoPath); } catch (e) {}
    }
  }
}

/** Vòng l?p chính luân phiên tham dò hàng d?i t? h? th?ng */
async function ztteam_workerLoop() {
  if (isProcessing) return;

  try {
    /** 1. Ki?m tra Chrome có dang b?t không */
    const chromeAlive = await ztteam_isChromeRunning();
    if (!chromeAlive) {
      process.stdout.write(`\r[${WORKER_NAME}] Ch? Chrome m? t?i ${CHROME_DEBUG_URL}...`);
      return;
    }

    /** 2. L?y h? th?ng ki?m tra theo vòng l?p Round-Robin */
    const target = VPS_TARGETS[currentTargetIndex];
    currentTargetIndex = (currentTargetIndex + 1) % VPS_TARGETS.length;

    /** 3. H?i h? th?ng xem có job t?o video không */
    const res = await axios.get(`${target.url}/api/image/pending-video?auto=true`, { timeout: 10000 });
    if (res.data && res.data.hasJob && res.data.job) {
      isProcessing = true;
      console.log(`\n?? [${WORKER_NAME}] Phát hi?n bài vi?t c?n t?o Video t? [${target.name}]: Job #${res.data.job.id}`);
      try {
        await ztteam_processVideoJobOnMuse(res.data.job, target);
      } finally {
        isProcessing = false;
      }
    } else {
      process.stdout.write(`\r[${new Date().toLocaleTimeString()}] [${WORKER_NAME}] Ðang ki?m tra [${target.name}]... (Hàng d?i tr?ng)`);
    }
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      process.stdout.write(`\r?? [${WORKER_NAME}] Không k?t n?i du?c t?i h? th?ng... Ðang th? l?i`);
    } else {
      console.error(`\n[${WORKER_NAME}] Worker Error:`, err.message);
    }
  }
}

console.log('========================================================');
console.log(`?? ZTTEAM MUSE REEL WORKER [${WORKER_NAME}] ÐÃ KH?I CH?Y!`);
console.log('?? Danh sách h? th?ng ph?c v? luân phiên:');
VPS_TARGETS.forEach(t => console.log(`   - ${t.name}: ${t.url}`));
console.log(`??? Chrome Target : ${CHROME_DEBUG_URL}`);
console.log(`?? Chu k? ki?m tra: m?i ${POLL_INTERVAL_MS / 1000}s`);
console.log('??? Co ch?: T? d?ng F5 d?n RAM, ch?ng dán d?n 3-5 ?nh 100%');
console.log('========================================================\n');

/** Ch?y ngay l?n d?u và duy trì chu k? polling */
ztteam_workerLoop();
setInterval(ztteam_workerLoop, POLL_INTERVAL_MS);

