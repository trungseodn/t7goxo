import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import * as cheerio from "cheerio";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import * as fs from 'fs';
import * as path from 'path';
import Parser from 'rss-parser';
import { ztteam_getSourceOriginalsPath } from '../common/ztteam_storage.util';

export interface ZTTeamFetchResult {
  title: string;
  image: string | null;
  images?: string[];
  content: string;
  contentHtml: string;
  cleanHtmlWithImages?: string;
  excerpt: string;
  siteName: string | null;
  url: string;
}

export interface ZTTeamPaginationDiscovery {
  nextPageUrl: string | null;
  allPageUrls: string[];
  loadMoreData: {
    ajaxUrl?: string;
    action?: string;
    page?: number;
    maxPage?: number;
    query?: any;
    endpoint?: string;
  } | null;
  wpRestApiEndpoint: string | null;
  rssFeedUrl: string | null;
}

@Injectable()
export class ZTTeamFetcherService {
  private readonly logger = new Logger(ZTTeamFetcherService.name);
  private rssParser: Parser;

  constructor() {
    this.rssParser = new Parser({
      timeout: 12000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
  }

  async ztteam_fetchHtml(url: string): Promise<string> {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000), /** 15 seconds timeout */
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Upgrade-Insecure-Requests": "1",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      return response.text();
    } catch (error: any) {
      this.logger.error(`Failed to fetch HTML from ${url}`, error.stack);
      throw new HttpException(`Cannot fetch URL: ${error.message}`, HttpStatus.BAD_REQUEST);
    }
  }

  private ztteam_extractOgImage($: any): string | null {
    return (
      $('meta[property="og:image"]').attr("content") ||
      $('meta[name="twitter:image"]').attr("content") ||
      null
    );
  }

  private ztteam_extractSiteName($: any): string | null {
    return $('meta[property="og:site_name"]').attr("content") || null;
  }
  
  private ztteam_extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'Unknown';
    }
  }

  /**
   * ZTTeam: Kiểm tra thông minh URL có phải là bài viết đơn lẻ (Single Story Article) thực sự hay không.
   * Hỗ trợ đầy đủ: slug SEO gạch nối, date permalink, Post ID số/query param, bài viết trong chuyên mục, v.v.
   * Loại trừ chính xác: Trang chủ, chuyên mục cấp đầu, trang tĩnh hệ thống, phân trang (pagination).
   */
  ztteam_isArticleUrl(candidateUrl: string, baseDomain: string): boolean {
    try {
      const u = new URL(candidateUrl);
      
      /** 1. Bắt buộc cùng hostname hoặc là subdomain của baseDomain */
      const candHost = u.hostname.toLowerCase();
      const baseHost = baseDomain.toLowerCase();
      if (candHost !== baseHost && !candHost.endsWith(`.${baseHost}`)) {
        return false;
      }

      let path = u.pathname.trim();
      const search = u.search;

      /** Hỗ trợ bài viết có dạng query parameter: ?p=123 hoặc ?id=123 hoặc ?post=123 */
      if ((!path || path === '/' || path === '') && search) {
        const pParam = u.searchParams.get('p') || u.searchParams.get('id') || u.searchParams.get('post') || u.searchParams.get('article_id');
        if (pParam && /^\d+$/.test(pParam)) {
          return true;
        }
        return false;
      }

      if (!path || path === '/' || path === '') {
        return false;
      }

      /** Chuẩn hóa: loại bỏ trailing slash */
      const normalizedPath = path.endsWith('/') ? path.slice(0, -1) : path;
      const pathLower = normalizedPath.toLowerCase();

      /** 2. Phân đoạn path thành mảng segments */
      const segments = normalizedPath.split('/').filter(Boolean);
      if (segments.length === 0) {
        return false;
      }

      const lastSegment = segments[segments.length - 1].toLowerCase();

      /** 3. Loại trừ các trang hệ thống, chính sách, tài khoản */
      const staticSystemPages = new Set([
        'about', 'about-us', 'contact', 'contact-us', 'privacy', 'privacy-policy',
        'terms', 'terms-of-service', 'terms-and-conditions', 'disclaimer', 'policy',
        'dmca', 'sitemap', 'faq', 'advertise', 'advertising', 'quang-cao', 'lien-he',
        'gioi-thieu', 'login', 'register', 'signup', 'cart', 'checkout', 'my-account',
        'wp-admin', 'wp-login', 'wp-content', 'wp-includes', 'admin'
      ]);
      if (staticSystemPages.has(lastSegment)) {
        return false;
      }

      /** Loại trừ các trang phân trang (pagination itself is not an article) */
      if (/^page$/i.test(lastSegment) || /^p$/i.test(lastSegment)) {
        return false;
      }
      if (segments.length >= 2 && segments[segments.length - 2].toLowerCase() === 'page' && /^\d+$/.test(lastSegment)) {
        return false;
      }
      if (/\/page\/\d+$/i.test(pathLower) || /\/p\/\d+$/i.test(pathLower) || /\/page-\d+$/i.test(pathLower)) {
        return false;
      }

      /** Loại trừ các file tĩnh / media */
      const staticExtensions = [
        '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico',
        '.mp4', '.mp3', '.webm', '.avi', '.mov',
        '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
        '.css', '.js', '.json', '.xml', '.rss', '.atom'
      ];
      for (const ext of staticExtensions) {
        if (pathLower.endsWith(ext)) {
          return false;
        }
      }

      /** 4. Kiểm tra trang chuyên mục / danh mục:
       * Nếu URL kết thúc tại cấp chuyên mục (ví dụ /category/life hoặc /tag/viral), đây KHÔNG phải bài viết.
       * Nhưng nếu sau chuyên mục có slug bài viết (ví dụ /category/life/my-touching-story), đây LÀ bài viết!
       */
      const categoryIndicators = new Set([
        'category', 'categories', 'c', 'cat', 'chuyen-muc', 'danh-muc', 'the-loai',
        'tag', 'tags', 'the', 'topic', 'topics', 'label', 'keyword', 'sections',
        'section', 'author', 'tac-gia', 'user', 'profile', 'members', 'archive', 'archives'
      ]);

      if (segments.length === 1 && categoryIndicators.has(segments[0].toLowerCase())) {
        return false;
      }
      if (segments.length === 2 && categoryIndicators.has(segments[0].toLowerCase())) {
        return false;
      }

      /** Loại trừ các slug đơn lẻ phổ biến của chuyên mục / landing page */
      const genericSingleSlugs = new Set([
        'news', 'stories', 'story', 'popular', 'trending', 'latest', 'life', 'lifestyle',
        'health', 'tech', 'technology', 'business', 'viral', 'featured', 'home', 'posts',
        'blog', 'articles', 'article', 'tin-tuc', 'trang-chu', 'chuyen-muc', 'su-kien',
        'feed', 'rss', 'all', 'search'
      ]);
      if (genericSingleSlugs.has(lastSegment)) {
        return false;
      }

      /** 5. Quy luật nhận diện bài viết thực thụ (High-Recall Accurate Article Recognition) */
      
      /** Mẫu A: Dạng date permalink: /2024/10/slug hoặc /2026/10/11/slug */
      const dateMatch = pathLower.match(/\/\d{4}\/\d{2}(?:\/\d{2})?\/([a-z0-9\-_]+)$/);
      if (dateMatch && dateMatch[1] && dateMatch[1].length >= 3) {
        return true;
      }

      /** Mẫu B: Post ID dạng số (ví dụ: WordPress permalink /12345/ hoặc /p/12345 hoặc /archives/12345) */
      const numericIdMatch = lastSegment.match(/^\d{2,10}$/);
      if (numericIdMatch) {
        return true;
      }

      /** Mẫu C: Nằm trong thư mục bài viết (stories, story, article, articles, post, posts, truyen, bai-viet, news, read) */
      const hasArticleFolder = segments.some((s, idx) => 
        idx < segments.length - 1 && 
        ['story', 'stories', 'article', 'articles', 'post', 'posts', 'truyen', 'bai-viet', 'news', 'read', 'read-story'].includes(s.toLowerCase())
      );
      if (hasArticleFolder && lastSegment.length >= 4 && !genericSingleSlugs.has(lastSegment)) {
        return true;
      }

      /** Mẫu D: Slug có dấu gạch ngang '-' hoặc gạch dưới '_' (chuẩn slug SEO bài viết) */
      const hyphenOrUnderscoreCount = (lastSegment.match(/[_-]/g) || []).length;
      /** Chỉ cần >= 1 dấu gạch nối và độ dài >= 6 (ví dụ: my-wife, true-love, lost-son, broken-heart...) */
      if (hyphenOrUnderscoreCount >= 1 && lastSegment.length >= 6) {
        return true;
      }

      /** Mẫu E: Đuôi .html hoặc .htm với slug dài >= 4 */
      if (lastSegment.endsWith('.html') || lastSegment.endsWith('.htm')) {
        const baseSlug = lastSegment.replace(/\.html?$/, '');
        if (baseSlug.length >= 4) {
          return true;
        }
      }

      /** Mẫu F: Slug dạng mã hash / alphanumeric dài >= 8 (Medium, Substack, hash ID) */
      if (/^[a-z0-9]{8,32}$/i.test(lastSegment) && /\d/.test(lastSegment) && /[a-z]/i.test(lastSegment)) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * ZTTeam: Kiểm duyệt chất lượng nội dung bài viết câu chuyện trước khi xuất bản.
   * Đảm bảo không phải trang chuyên mục (như "News"), trang 404/Cloudflare, hoặc nội dung quá ngắn.
   * Đặc biệt: LỌC BỎ CÁC BÀI VIẾT THỜI SỰ, TIN TỨC, KINH TẾ, THỂ THAO ĐỂ CHỈ LẤY ĐÚNG STORY / CÂU CHUYỆN.
   */
  ztteam_validateStoryArticle(title: string, content: string, url?: string): { isValid: boolean; reason?: string } {
    const trimmedTitle = (title || '').trim();
    const trimmedContent = (content || '').trim();

    /** 1. Kiểm tra tiêu đề */
    if (!trimmedTitle || trimmedTitle.length < 10) {
      return { isValid: false, reason: `Tiêu đề quá ngắn (${trimmedTitle.length} ký tự)` };
    }

    const titleWords = trimmedTitle.split(/\s+/).filter(Boolean);
    if (titleWords.length < 3) {
      return { isValid: false, reason: `Tiêu đề có quá ít từ (${titleWords.length} từ), có khả năng là chuyên mục hoặc từ khóa đơn lẻ` };
    }

    const titleLower = trimmedTitle.toLowerCase();
    const genericTitles = [
      'news',
      'home',
      'tin tức',
      'trang chủ',
      'category',
      'categories',
      'archives',
      'archive',
      'chuyên mục',
      'danh mục',
      'search results',
      '404 not found',
      'access denied',
      'attention required',
      'just a moment',
      'about us',
      'contact us',
      'privacy policy',
      'terms of service',
      'stories',
      'popular',
      'latest stories',
      'uncategorized'
    ];

    for (const generic of genericTitles) {
      if (titleLower === generic || titleLower === `${generic} - stories` || titleLower === `${generic} | stories`) {
        return { isValid: false, reason: `Tiêu đề "${trimmedTitle}" trùng với từ khóa chuyên mục/hệ thống` };
      }
    }

    /** 2. Kiểm tra độ dài nội dung */
    if (trimmedContent.length < 250) {
      return { isValid: false, reason: `Nội dung quá ngắn (${trimmedContent.length} ký tự < 250 ký tự tiêu chuẩn)` };
    }

    /** 3. Kiểm tra số câu hoàn chỉnh */
    const sentenceCount = (trimmedContent.match(/[.!?](\s+|$)/g) || []).length;
    if (sentenceCount < 2) {
      return { isValid: false, reason: `Nội dung không đủ câu hoàn chỉnh (${sentenceCount} câu < 2)` };
    }

    /** 4. BỘ LỌC CHUYÊN SÂU: PHÁT HIỆN & LOẠI BỎ TIN TỨC / BÁO CHÍ (CHỈ CHẤP NHẬN STORY) */
    const storyCheck = this.ztteam_classifyStoryOrNews(trimmedTitle, trimmedContent, url);
    if (!storyCheck.isStory) {
      return { isValid: false, reason: storyCheck.reason };
    }

    return { isValid: true };
  }

  /**
   * ZTTeam Story Classifier (Deep Semantic Reader & Filter):
   * Đọc bài viết trước khi cào và chắc chắn 100% chỉ cào bài thuộc về Story (truyện tâm sự đời sống, gia đình, drama, moral lesson).
   * Loại bỏ triệt để:
   * 1. Tin tai nạn, thảm họa, rơi máy bay/trực thăng, va chạm giao thông chết người (crashes, fatal collisions).
   * 2. Tin tìm kiếm người mất tích, cứu hộ cứu nạn (missing person searches, underwater police).
   * 3. Tin cáo phó, chia buồn, tưởng niệm người mất (obituaries, gone too soon, remembered as, passed away).
   * 4. Bản tin y khoa, phẫu thuật dị tật, bệnh án hiếm, cập nhật ung thư (conjoined twins, rare condition, surgeries).
   * 5. Tin thể thao, cầu thủ tử nạn, bóng đá, chuyển nhượng (footballer, goalkeeper, tournament).
   * 6. Tin chính trị, thời sự, kinh tế tài chính, chứng khoán, review sản phẩm.
   */
  private ztteam_classifyStoryOrNews(
    title: string,
    content: string,
    url?: string
  ): { isStory: boolean; reason?: string } {
    const titleLower = title.toLowerCase();
    const contentLower = content.toLowerCase();

    // 1. Kiểm tra URL chuyên mục tin tức (nếu có URL)
    if (url) {
      const urlLower = url.toLowerCase();
      const newsUrlPatterns = [
        /\/news\//,
        /\/breaking\//,
        /\/politics\//,
        /\/finance\//,
        /\/economy\//,
        /\/market\//,
        /\/sports\//,
        /\/football\//,
        /\/soccer\//,
        /\/gadgets\//,
        /\/tech-news\//,
        /\/press-release\//,
        /\/weather\//,
      ];
      const isNewsPath = newsUrlPatterns.some((pattern) => pattern.test(urlLower));
      const isStoryPath = /\/(story|stories|life|drama|relationship|lesson|tales)\//.test(urlLower);

      if (isNewsPath && !isStoryPath) {
        return {
          isStory: false,
          reason: `URL bài viết nằm trong chuyên mục tin tức thời sự/thể thao/tài chính (${url})`,
        };
      }
    }

    // 2. BỘ QUY TẮC PHỦ ĐỊNH TIÊU ĐỀ TUYỆT ĐỐI (STRICT TITLE DISQUALIFIERS)
    // Nếu tiêu đề khớp với bất kỳ mẫu tin tức, tai nạn, mất tích, cáo phó, y tế nào dưới đây -> LOẠI NGAY LẬP TỨC
    const strictTitleDisqualifiers: { pattern: RegExp; label: string }[] = [
      // 2.1 Tai nạn, thảm họa, va chạm giao thông, rơi máy bay/trực thăng
      {
        pattern: /\b(?:jet|airplane|plane|helicopter|car|bus|truck|vehicle|train|boat|ship|yacht|double-decker)\s+(?:crash|collision|wreck|accident|plunge|disaster)\b/i,
        label: 'Tin tai nạn phương tiện (máy bay, trực thăng, xe buýt, tàu thuyền)'
      },
      {
        pattern: /\b(?:fatal|tragic|horrific|deadly)\s+(?:crash|collision|accident|fall|plunge|wreck|disaster|double-decker)\b/i,
        label: 'Tin tai nạn chết người/thảm họa thảm khốc'
      },
      {
        pattern: /\b(?:claims\s+life\s+of|claimed\s+the\s+life\s+of|claim\s+the\s+life\s+of|lives\s+claimed)\b/i,
        label: 'Tin tức cướp đi sinh mạng người khác'
      },
      {
        pattern: /\b(?:killed\s+in\s+(?:a\s+)?(?:crash|accident|collision|fire|blast|explosion|disaster))\b/i,
        label: 'Tin tử nạn trong tai nạn/cháy nổ'
      },
      {
        pattern: /\b(?:lost\s+in\s+.*(?:crash|collision|accident))\b/i,
        label: 'Tin người thiệt mạng trong tai nạn'
      },
      {
        pattern: /\b(?:died\s+from\s+chest\s+trauma|died\s+after\s+horrific|dies\s+after\s+horrific|dies\s+following\s+horrific)\b/i,
        label: 'Tin tử vong do chấn thương sau va chạm'
      },
      {
        pattern: /\b(?:on-(?:pitch|field)\s+collision|mid-game\s+collision)\b/i,
        label: 'Tin va chạm chấn thương trên sân cỏ'
      },
      {
        pattern: /\b(?:tragic\s+(?:fifth-floor|balcony|cliff|roof|story|window)\s+fall)\b/i,
        label: 'Tin tai nạn ngã từ tầng cao/ban công'
      },
      {
        pattern: /\b(?:drowned\s+at\s+sea|drowned\s+in|missing\s+at\s+sea)\b/i,
        label: 'Tin đuối nước/mất tích trên biển'
      },
      {
        pattern: /\b(?:pilot\s+lost|pilot\s+killed|aviation\s+executive.*survive)\b/i,
        label: 'Tin tử nạn phi công/hàng không'
      },
      {
        pattern: /\b(?:cause\s+of\s+death\s+revealed|autopsy\s+reveals)\b/i,
        label: 'Tin công bố nguyên nhân tử vong/khám nghiệm tử thi'
      },
      {
        pattern: /\b(?:fatal\s+\d+-story\s+plunge|fatal\s+plunge)\b/i,
        label: 'Tin rơi từ tầng cao tử nạn'
      },

      // 2.2 Người mất tích & Chiến dịch tìm kiếm của cảnh sát
      {
        pattern: /\b(?:missing\s+person|search\s+for\s+missing|still\s+missing|vanished\s+without\s+a\s+trace|disappeared\s+without\s+a\s+trace)\b/i,
        label: 'Tin tìm kiếm người mất tích không dấu vết'
      },
      {
        pattern: /\b(?:\d+\s+(?:days|weeks|months|years)\s+without\s+a\s+trace)\b/i,
        label: 'Tin mất tích nhiều ngày không dấu vết'
      },
      {
        pattern: /\b(?:desperate\s+search\s+for\s+missing|search\s+intensifies\s+for)\b/i,
        label: 'Tin mở rộng chiến dịch tìm kiếm người mất tích'
      },
      {
        pattern: /\b(?:underwater\s+police\s+teams|sonar\s+teams|search\s+ends\s+without\s+answers)\b/i,
        label: 'Tin cảnh sát lặn tìm kiếm người mất tích'
      },
      {
        pattern: /\b(?:missing\s+(?:\d+-year-old|dog\s+walker|fisherman|fishermen|hiker|swimmer|teen|toddler|elderly))\b/i,
        label: 'Tin mất tích theo nhân dạng/nghề nghiệp'
      },
      {
        pattern: /\b(?:scour\s+canal\s+after\s+his\s+pet\s+is\s+found\s+alone)\b/i,
        label: 'Tin tìm kiếm người mất tích sau khi tìm thấy thú cưng'
      },

      // 2.3 Cáo phó, Tưởng niệm, Chia buồn tử nạn
      {
        pattern: /\b(?:gone\s+too\s+soon|life\s+was\s+cut\s+short|life\s+cut\s+short)\b/i,
        label: 'Tin tưởng niệm người ra đi quá sớm (Gone too soon)'
      },
      {
        pattern: /\b(?:remembered\s+as\s+a\s+["“']?ray\s+of\s+sunshine["”']?|remembered\s+as\s+a)\b/i,
        label: 'Tin tưởng niệm người đã khuất'
      },
      {
        pattern: /\b(?:the\s+remarkable\s+(?:life|journey)\s+of\s+[A-Z][a-z]+)\b/i,
        label: 'Tin phóng sự tiểu sử người nổi tiếng/quá cố'
      },
      {
        pattern: /\b(?:parents\s+mourn\s+\d+-year-old|parents\s+mourn\s+[A-Z][a-z]+|family\s+mourns\s+[A-Z][a-z]+)\b/i,
        label: 'Tin gia đình đau buồn trước sự ra đi của con/người thân'
      },
      {
        pattern: /\b(?:passed\s+away\s+at\s+age|breaks\s+silence\s+after\s+(?:tragic\s+)?death)\b/i,
        label: 'Tin qua đời/chia buồn sau cái chết thương tâm'
      },
      {
        pattern: /\b(?:rest\s+in\s+peace|in\s+loving\s+memory\s+of|heartbreaking\s+tributes\s+to)\b/i,
        label: 'Tin phân ưu tưởng niệm'
      },
      {
        pattern: /\b(?:leaves\s+behind\s+(?:young\s+wife|loving\s+family|children|husband))\b/i,
        label: 'Tin người qua đời để lại vợ trẻ/con nhỏ'
      },
      {
        pattern: /\b(?:should\s+have\s+been\s+back\s+in\s+class\s*—\s*\d+-year-old)\b/i,
        label: 'Tin tưởng niệm học sinh tử nạn'
      },

      // 2.4 Bản tin Y tế, Bệnh án hiếm, Dị tật bẩm sinh, Cập nhật Ung thư
      {
        pattern: /\b(?:conjoined\s+twins|craniopagus|separation\s+surgery)\b/i,
        label: 'Tin y tế phẫu thuật tách cặp song sinh dính liền'
      },
      {
        pattern: /\b(?:rare\s+(?:genetic\s+condition|genetic\s+disorder|disorder|condition|syndrome|fluid-buildup|disease))\b/i,
        label: 'Tin bệnh án hiếm/hội chứng di truyền hiếm gặp'
      },
      {
        pattern: /\b(?:down\s+syndrome|cornelia\s+de\s+lange|axenfeld-rieger|glaucoma|cataracts|hypoplastic\s+left\s+heart)\b/i,
        label: 'Tin bệnh án y khoa cụ thể (Down, Cornelia, Axenfeld, Tim bẩm sinh)'
      },
      {
        pattern: /\b(?:acrania|arhinia|microcephaly|hydrocephalus|spina\s+bifida|progeria)\b/i,
        label: 'Tin dị tật bẩm sinh hiếm gặp ở trẻ sơ sinh'
      },
      {
        pattern: /\b(?:battling\s+hypoplastic|battling\s+leukemia|faces\s+(?:his|her)?\s*(?:first|second|third|fourth|fifth|major)\s+(?:heart\s+)?surgery)\b/i,
        label: 'Tin hoàn cảnh bệnh nhi đối mặt phẫu thuật tim/ung thư máu'
      },
      {
        pattern: /\b(?:cancer\s+update|shares\s+(?:encouraging|hopeful)\s+cancer\s+update|promising\s+new\s+drugs)\b/i,
        label: 'Bản tin y học cập nhật phác đồ điều trị ung thư'
      },
      {
        pattern: /\b(?:undergo\s+(?:a\s+)?remarkable\s+\d+-hour\s+(?:separation\s+)?surgery|odds\s+of\s+success)\b/i,
        label: 'Tin phẫu thuật kéo dài nhiều giờ'
      },
      {
        pattern: /\b(?:needs\s+surgery\s+to\s+reduce\s+their\s+size|unusual\s+little\s+arms|bubble-like\s+eye\s+bulge)\b/i,
        label: 'Tin dị tật cơ thể người thật'
      },
      {
        pattern: /\b(?:extremely\s+rare\s+condition|diagnosed\s+with\s+rare)\b/i,
        label: 'Tin phát hiện hội chứng cực kỳ hiếm'
      },
      {
        pattern: /\b(?:congenital\s+arhinia|facial\s+difference|rare\s+condition\s+behind\s+his)\b/i,
        label: 'Tin dị tật bẩm sinh Arhinia/khuôn mặt'
      },

      // 2.5 Thể thao & Showbiz người thật
      {
        pattern: /\b(?:olympic\s+gold\s+medalist|sir\s+chris\s+hoy|goalkeeper|footballer|striker|soccer\s+player|soccer\s+star)\b/i,
        label: 'Bản tin thể thao/vận động viên thi đấu'
      },
      {
        pattern: /\b(?:left\s+out\s+of\s+national\s+squad|scores?\s+hat-trick|premier\s+league|champions\s+league)\b/i,
        label: 'Tin bảng xếp hạng/đội tuyển bóng đá'
      },

      // 2.6 Chính trị, Bầu cử, Kinh tế, Review phần mềm
      {
        pattern: /\b(?:breaking|breaking\s+news|live\s+updates):/i,
        label: 'Tin giật gân phát sóng trực tiếp (Breaking news)'
      },
      {
        pattern: /\b(?:election\s+results|white\s+house\s+announces|pentagon\s+says|prime\s+minister\s+announces)\b/i,
        label: 'Tin chính trị chính phủ/bầu cử'
      },
      {
        pattern: /\b(?:stock\s+market|nasdaq|dow\s+jones|quarterly\s+profit|interest\s+rate|bitcoin\s+price)\b/i,
        label: 'Tin kinh tế thị trường tài chính chứng khoán'
      },
      {
        pattern: /\b(?:patch\s+notes|firmware\s+update|camera\s+specs|discount\s+code|buyers\s+guide)\b/i,
        label: 'Bài đánh giá công nghệ/thông số kỹ thuật'
      },
    ];

    for (const rule of strictTitleDisqualifiers) {
      if (rule.pattern.test(title)) {
        return {
          isStory: false,
          reason: `Tiêu đề thuộc thể loại "${rule.label}" (Tiêu đề: "${title}")`,
        };
      }
    }

    // 3. BỘ QUY TẮC PHỦ ĐỊNH NỘI DUNG (STRICT CONTENT DISQUALIFIERS)
    // Đọc phần nội dung mở đầu bài viết (đặc biệt 2500 ký tự đầu tiên)
    const contentIntro = content.substring(0, 2500);

    const strictContentDisqualifiers: { pattern: RegExp; label: string }[] = [
      // 3.1 Báo cáo hiện trường của Cảnh sát / Đội cứu hộ / Cứu thương
      {
        pattern: /\b(?:officers\s+were\s+dispatched|emergency\s+services\s+were\s+called|paramedics\s+arrived|paramedics\s+rushed|pronounced\s+dead\s+at\s+the\s+scene)\b/i,
        label: 'Báo cáo cảnh sát/cứu thương tại hiện trường tử vong'
      },
      {
        pattern: /\b(?:coast\s+guard|search\s+and\s+rescue\s+operation|underwater\s+search\s+unit|autopsy\s+(?:report|revealed)|coroner's\s+office|medical\s+examiner)\b/i,
        label: 'Khám nghiệm tử thi/cảnh sát tuần duyên lặn tìm kiếm'
      },
      {
        pattern: /\b(?:foul\s+play\s+is\s+not\s+suspected|crime\s+stoppers|call\s+(?:911|101)|police\s+department\s+(?:reported|confirmed|said|stated)|sheriff's\s+office\s+(?:confirmed|stated))\b/i,
        label: 'Thông báo báo chí chính thức của sở cảnh sát'
      },
      {
        pattern: /\b(?:anyone\s+with\s+information\s+is\s+urged\s+to\s+contact)\b/i,
        label: 'Kêu gọi nhân chứng cung cấp manh mối vụ án/mất tích'
      },

      // 3.2 Cáo phó, Phúng viếng, Gây quỹ tang lễ/viện phí
      {
        pattern: /\b(?:gofundme|gofundme\.com|fundraiser\s+organized\s+by|donations\s+can\s+be\s+made\s+to)\b/i,
        label: 'Kêu gọi quyên góp tiền qua GoFundMe'
      },
      {
        pattern: /\b(?:to\s+help\s+(?:the\s+family\s+)?cover\s+funeral\s+costs|cover\s+medical\s+bills)\b/i,
        label: 'Kêu gọi hỗ trợ chi phí mai táng/viện phí'
      },
      {
        pattern: /\b(?:is\s+survived\s+by\s+(?:his|her)|preceded\s+in\s+death\s+by|celebration\s+of\s+life\s+service|visitation\s+will\s+be\s+held|in\s+lieu\s+of\s+flowers|laid\s+to\s+rest\s+at)\b/i,
        label: 'Nghi thức tang lễ cáo phó người qua đời'
      },

      // 3.3 Phóng sự bệnh án y khoa
      {
        pattern: /\b(?:hospital\s+spokesperson|intensive\s+care\s+unit|pediatric\s+surgeon|underwent\s+a\s+\d+-hour\s+surgery)\b/i,
        label: 'Bản tin phát ngôn viên bệnh viện/phòng hồi sức tích cực ICU'
      },
      {
        pattern: /\b(?:meaning\s+they\s+were\s+joined\s+at\s+the|conjoined\s+twins|craniopagus)\b/i,
        label: 'Mô tả phẫu thuật song sinh dính liền'
      },
      {
        pattern: /\b(?:promising\s+new\s+drugs?\s+show|clinical\s+trials?\s+show)\b/i,
        label: 'Báo cáo thử nghiệm lâm sàng tân dược'
      },

      // 3.4 Quy chuẩn phong cách ký sự thông tấn
      {
        pattern: /^[A-Z\s]{2,20},\s*(?:Fla\.|Calif\.|N\.Y\.|Texas|Wash\.|London|Scotland|Paris)?\s*[-—]\s*/,
        label: 'Dấu ấn tin thông tấn báo chí (Dateline style: CITY, STATE — )'
      },
      {
        pattern: /\b(?:according\s+to\s+(?:police|officials|authorities|investigators|the\s+Associated\s+Press|reuters|cnn|bbc))\b/i,
        label: 'Trích dẫn nguồn tin thông tấn báo chí quốc tế'
      },
    ];

    for (const rule of strictContentDisqualifiers) {
      if (rule.pattern.test(contentIntro)) {
        return {
          isStory: false,
          reason: `Nội dung mở đầu chứa dấu hiệu "${rule.label}"`,
        };
      }
    }

    // 4. BỘ TIÊU CHÍ KHẲNG ĐỊNH CỐT TRUYỆN (POSITIVE STORY CRITERIA)
    // Một bài viết hợp lệ BẮT BUỘC phải mang đặc trưng của Story (kể chuyện, có nhân vật, có drama/xung đột, có thoại hoặc tự sự)
    
    // 4.1 Cờ hiệu chương hồi (Chapter 1, Part 2...)
    const hasChapterOrPart = /\b(?:chapter\s+\d+|part\s+\d+)\b/i.test(title) || /\b(?:chapter\s+\d+|part\s+\d+)\b/i.test(contentIntro);

    // 4.2 Đại từ tự sự ngôi thứ nhất (I, my, me, we, our, myself)
    const firstPersonMatches = contentLower.match(/\b(i|my|me|we|our|myself)\b/g) || [];
    const firstPersonCount = firstPersonMatches.length;

    // 4.3 Nhân vật quan hệ đời sống, gia đình, xã hội
    const characterKeywords = [
      /\b(husband|wife|mother|father|daughter|son|sister|brother|mom|dad|parents)\b/g,
      /\b(grandma|grandpa|grandmother|grandfather|in-law|mother-in-law|father-in-law|daughter-in-law|son-in-law)\b/g,
      /\b(fiancé|fiancée|ex-husband|ex-wife|stepmother|stepfather|stepson|stepdaughter)\b/g,
      /\b(mistress|lover|cheater|partner|maid|housemaid|billionaire)\b/g,
      /\b(baby|toddler|kid|kids|child|children|nephew|niece|cousin|aunt|uncle|family|relatives?)\b/g,
      /\b(neighbor|landlord|tenant|boss|secretary|coworker|colleague|stranger|homeless|waitress|cashier|sheriff)\b/g,
    ];
    let characterScore = 0;
    for (const re of characterKeywords) {
      const m = contentLower.match(re);
      if (m) characterScore += m.length;
    }

    // 4.4 Tình tiết cảm xúc, cao trào, diễn biến drama
    const dramaKeywords = [
      /\b(cried|whispered|screamed|gasped|shivered|trembled|sobbed|hugged|tears)\b/g,
      /\b(divorce|wedding|marriage|funeral|coffin|grave|cemetery)\b/g,
      /\b(inheritance|inherited|will\s+and\s+testament|secret|betrayed|confessed|apologized|forgave)\b/g,
      /\b(embarrassed|pregnant|pregnancy|adoption|adopted|dna\s+test|evicted|eviction)\b/g,
      /\b(smiled|smugly|panicked|furious|speechless|refused|demanded|discovered)\b/g,
      /\b(thirty\s+minutes\s+later|the\s+truth\s+was|years\s+later|suddenly,)\b/g,
    ];
    let dramaScore = 0;
    for (const re of dramaKeywords) {
      const m = contentLower.match(re);
      if (m) dramaScore += m.length;
    }

    // 4.5 Lời thoại nhân vật trong ngoặc kép
    const dialogueMatches = content.match(/[“"][^”"\n]{3,}[”"]/g) || [];
    const dialogueCount = dialogueMatches.length;

    // QUYẾT ĐỊNH CUỐI CÙNG VỀ THỂ LOẠI STORY:
    // Trường hợp A: Có đánh số Part/Chapter -> Story
    if (hasChapterOrPart && (characterScore >= 1 || dramaScore >= 1)) {
      return { isStory: true };
    }

    // Trường hợp B: Truyện tự sự ngôi thứ nhất (First-person confession / life story)
    // Yêu cầu: Ngôi thứ nhất >= 3 lần, có nhân vật hoặc tình tiết drama
    if (firstPersonCount >= 3 && ((characterScore >= 1 && dramaScore >= 1) || dramaScore >= 2 || characterScore >= 2)) {
      return { isStory: true };
    }

    // Trường hợp C: Truyện kể có thoại nhân vật (Narrative story with dialogue)
    // Yêu cầu: Lời thoại >= 1 đoạn, có nhân vật hoặc tình tiết drama
    if (dialogueCount >= 1 && (characterScore >= 1 || dramaScore >= 1)) {
      return { isStory: true };
    }

    // Trường hợp D: Truyện ngôi thứ ba giàu nhân vật và kịch tính (Third-person narrative drama)
    if (characterScore >= 2 && dramaScore >= 2) {
      return { isStory: true };
    }

    // Trường hợp E: Bài viết ngôi thứ ba không có thoại, không có Part/Chapter, không có tự sự
    // Đây thường là bài viết tin tức, bài tường thuật sự kiện, hoặc văn bản tin tức chung chung -> BỎ QUA
    return {
      isStory: false,
      reason: `Nội dung thiếu đặc trưng câu chuyện tự sự (Ngôi kể: ${firstPersonCount}, Nhân vật: ${characterScore}, Drama: ${dramaScore}, Lời thoại: ${dialogueCount})`,
    };
  }


  private ztteam_parseReadability(
    html: string,
    url: string,
  ): {
    title: string;
    content: string;
    contentHtml: string;
    excerpt: string;
  } {
    const { document } = parseHTML(html);
    /** Ignore read-only baseURI error by using Object.defineProperty */
    Object.defineProperty(document, 'baseURI', { value: url, writable: true });
    
    /** @ts-ignore - Readability types can be tricky */
    const reader = new Readability(document);
    const article = reader.parse();

    if (!article) {
      throw new Error("Không thể parse nội dung bài viết");
    }

    return {
      title: article.title || "",
      content:
        article.textContent
          ?.replace(/\t/g, " ")
          .replace(/[ ]{2,}/g, " ")
          .replace(/\. ([A-Z])/g, ".\n\n$1")
          .replace(/([.!?])\s+([A-Z])/g, "$1\n\n$2")
          .trim() || "",
      contentHtml: article.content || "",
      excerpt: article.excerpt || "",
    };
  }

  /**
   * Fallback bypass fetcher for geo-blocked, Cloudflare-protected, or anti-bot websites
   * Uses global proxy gateway (Jina Reader) located in US/EU to retrieve full story text & images
   */
  async ztteam_fetchViaBypassProxy(url: string): Promise<ZTTeamFetchResult> {
    this.logger.log(`Attempting bypass proxy fetch for geo-blocked/protected URL: ${url}`);
    const proxyUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(proxyUrl, {
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Proxy bypass failed with status: ${response.status}`);
    }

    const rawBody = await response.text();
    let text = rawBody;
    let title = '';
    let featuredImage: string | null = null;
    const images: string[] = [];

    try {
      const json = JSON.parse(rawBody);
      const data = json?.data || json;
      if (data && typeof data === 'object') {
        title = data.title || '';
        text = data.content || rawBody;
        const meta = data.metadata || {};
        featuredImage = meta['og:image'] || meta['twitter:image'] || data.image || null;
      }
    } catch (e) {
      /** Fallback nếu Jina trả về text plain thay vì JSON */
      const lines = rawBody.split('\n');
      for (const line of lines) {
        if (line.startsWith('Title:')) {
          title = line.replace('Title:', '').trim();
          break;
        }
      }
    }

    const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
    let m;
    while ((m = imgRegex.exec(text)) !== null) {
      if (!images.includes(m[1])) {
        images.push(m[1]);
      }
    }

    const isUnwantedCover = (u: string | null | undefined): boolean => {
      if (!u) return true;
      const lower = u.toLowerCase();
      return (
        lower.includes('collage') ||
        lower.includes('newspress-collage') ||
        lower.includes('video-player') ||
        lower.includes('player-overlay') ||
        lower.includes('header-banner') ||
        lower.includes('placeholder') ||
        lower.includes('default-image') ||
        lower.includes('logo') ||
        lower.includes('avatar')
      );
    };

    if (featuredImage && isUnwantedCover(featuredImage)) {
      featuredImage = null;
    }

    const filteredImages = images.filter(img => !isUnwantedCover(img));
    if (!featuredImage && filteredImages.length > 0) {
      featuredImage = filteredImages[0];
    }

    /** Clean markdown headers, audio player artifacts (00:00), ad text, and image markdown from text */
    const cleanContent = this.ztteam_cleanStoryContent(text);
    const finalTitle = title || this.ztteam_extractDomain(url);

    /** ZTTeam Gatekeeper: Kiểm duyệt nội dung từ proxy trước khi trả về */
    const validation = this.ztteam_validateStoryArticle(finalTitle, cleanContent, url);
    if (!validation.isValid) {
      throw new HttpException(`Không phải bài viết hợp lệ (${validation.reason})`, HttpStatus.BAD_REQUEST);
    }

    /** ZTTeam: Chuẩn hóa HTML có chứa ảnh cho website đích */
    let cleanHtmlWithImages = cleanContent.split(/\n\s*\n/).map(p => `<p>${p.trim()}</p>`).join('\n');
    if (filteredImages.length > 0) {
      const imgTags = filteredImages.map(img => `<p><img src="${img}" alt="" /></p>`).join('\n');
      cleanHtmlWithImages = `${cleanHtmlWithImages}\n${imgTags}`;
    }

    return {
      title: finalTitle,
      image: featuredImage || (filteredImages.length > 0 ? filteredImages[0] : null),
      images: [...new Set(filteredImages)],
      content: cleanContent,
      contentHtml: cleanContent,
      cleanHtmlWithImages,
      excerpt: cleanContent.substring(0, 200),
      siteName: this.ztteam_extractDomain(url),
      url,
    };
  }

  /**
   * ZTTeam: Làm sạch HTML bài viết nhưng giữ lại cấu trúc đoạn văn (<p>) và hình ảnh (<img>, <figure>)
   */
  ztteam_cleanHtmlKeepImages(rawHtml: string, baseUrl: string): string {
    if (!rawHtml) return '';
    try {
      const $ = cheerio.load(rawHtml);
      $(
        [
          'script', 'style', 'noscript', 'iframe', 'form', 'button', 'nav', 'header', 'footer',
          '.sharedaddy', '.ads', '[data-widget-id]', '.author-box', '.social-share', 'time', '.breadcrumbs',
          '.featured-image', '.featured-image__wrapper', '.nyp-video-player',
          '.connatix-outstream-video', '#connatix-outstream-video', '.video-player', '[class*="video-player"]',
          '[id*="jw-player"]', '[class*="jw-player"]', '.jwplayer', '#nyp-player-lcp-overlay', 'video',
          '.single__inline-module', '.inline-module', 'aside',
          '.ad-wrapper', '.ad-unit', '[id^="div-gpt-ad"]', '.commercial-unit',
          '.nyp-slideshow-modal-image__icon', '.nyp-slideshow-modal-image-counter',
          '.email-signup', '.newsletter-signup', '.see-also', '.read-next',
          '#comments', '.conversations-container',
          '.wp-block-nyp-editor-universal-promo', '.universal-promo__inner',
          '.comments-inline-cta', '.comments-cta',
          'hr.wp-block-separator', '.wp-block-separator'
        ].join(', ')
      ).remove();

      // Unwrap slideshow modal anchors around images
      $('a[data-slideshow-modal], a[aria-controls="nyp-slideshow-modal"]').each((_, el) => {
        $(el).replaceWith($(el).contents());
      });
      $('.nyp-slideshow-modal-image__wrapper').each((_, el) => {
        $(el).replaceWith($(el).contents());
      });
      $('figure.nyp-slideshow-modal-image').removeClass('nyp-slideshow-modal-image');

      // Loại bỏ triệt để các khối văn bản/heading/group kêu gọi tải app / newsletter / mạng xã hội
      const isPromoText = (txt: string) => {
        if (!txt) return false;
        const lower = txt.toLowerCase();
        return (
          lower.includes('california post app') ||
          lower.includes('download the california post app') ||
          lower.includes('california post news:') ||
          lower.includes('california post sports') ||
          lower.includes('california post opinion') ||
          lower.includes('california post newsletters') ||
          lower.includes('follow us on social, and subscribe to our newsletters') ||
          lower.includes('sign up here!') ||
          lower.includes('download here!') ||
          lower.includes('home delivery:') ||
          lower.includes('page six hollywood') ||
          lower.includes('see more of our coverage in your search results')
        );
      };

      // Xóa các leaf elements (h1-h6, p, li, a) chứa promo text
      $('h1, h2, h3, h4, h5, h6, p, li, a').each((_, el) => {
        const txt = $(el).text().trim();
        if (txt && isPromoText(txt)) {
          $(el).remove();
        }
      });

      // Xóa các wrapper group promo như .wp-block-group
      $('.wp-block-group, div').each((_, el) => {
        const $el = $(el);
        if ($el.hasClass('entry-content') || $el.hasClass('single__content') || $el.hasClass('article-content')) {
          return;
        }
        const txt = $el.text().trim();
        if (!txt || isPromoText(txt)) {
          $el.remove();
        }
      });

      $('img').each((_, el) => {
        let src = $(el).attr('src') || $(el).attr('data-src');
        const rawSrcset = $(el).attr('srcset') || $(el).attr('data-srcset');
        if ((!src || src.startsWith('data:')) && rawSrcset) {
          const parts = rawSrcset.split(',').map(s => s.trim().split(' ')[0]).filter(Boolean);
          if (parts.length > 0) {
            src = parts[parts.length - 1]; // Lấy ảnh độ phân giải cao nhất
          }
        }

        // Bỏ qua các ảnh base64 placeholder hoặc icon nhỏ
        if (src && !src.startsWith('data:')) {
          try {
            src = new URL(src, baseUrl).href;
            $(el).attr('src', src);
          } catch (e) {}
        } else {
          $(el).remove();
        }

        $(el).removeAttr('srcset').removeAttr('sizes').removeAttr('loading').removeAttr('data-src').removeAttr('data-srcset');
      });

      // Bỏ bất kỳ ảnh / figure nào đứng ở đầu bài viết (trước đoạn văn đầu tiên)
      const firstP = $('p').first();
      if (firstP.length) {
        firstP.prevAll('figure, img, div:has(img)').remove();
      }

      return $('body').html() || $.html();
    } catch {
      return rawHtml;
    }
  }

  /**
   * Clean story text: ensure 100% of main narrative is kept, while removing all ads,
   * audio player strings, timestamps, social sharing buttons, viral engagement callouts,
   * navigation links, and disclaimer blocks.
   */
  ztteam_cleanStoryContent(rawText: string): string {
    let text = rawText
      .replace(/^Title:.*?\n/m, '')
      .replace(/^URL Source:.*?\n/m, '')
      .replace(/^Markdown Content:\n/m, '')
      .replace(/div\[data-widget-id.*?\}\s*/gs, '')
      .replace(/\(function\(w,q\)[\s\S]*?\(window,["']_mgq["']\);?/g, '')
      .replace(/\{[^{}]*min-height:[^{}]*\}/g, '')
      .replace(/(?:00:00\s*)+/g, '')
      .replace(/(?:\b0?\d:\d{2}\s*)+/g, '') /** Strip loose timestamps like 0:00 */
      .replace(/!\[.*?\]\([^\s\)]+\)/g, '') /** Remove markdown images */
      /** Remove author box, breadcrumbs, reading time, and date patterns */
      .replace(/^(?:Stories|Home|thieponline)\s*$/gim, '')
      .replace(/^(?:Senior Correspondent|Staff Writer|Editor|Author|Contributor)\s*$/gim, '')
      .replace(/^\d+\s+min read\s*$/gim, '')
      .replace(/^\d+\s+(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s+\d{4}\s*$/gim, '')
      /** Remove ad blocks, sponsored phrases, and cookie notices */
      .replace(/\[?(?:Advertisement|Sponsored Content|Promoted Stories|Related Stories|Share on Facebook|Share on Twitter|Pin it|Leave a Reply|Leave a comment|Cookie Policy|Accept Cookies)\]?/gi, '')
      /** Remove standalone social button words */
      .replace(/^(?:Facebook|Twitter|LinkedIn|Like|Comment|Share|Follow)\s*$/gim, '')
      /** Remove audio player strings */
      .replace(/(?:Audio Player|Listen to this story|Play audio|Pause audio)/gi, '')
      /** Remove video player overlay script artifacts */
      .replace(/\(function\(\)\s*\{\s*var\s*overlay[\s\S]*?\}\)\(\);?/g, '')
      /** Remove search result disclosure and related promo */
      .replace(/^See more of our coverage in your search results\.?\s*$/gim, '')
      .replace(/^Explore More[^\n]*$/gim, '')
      .replace(/Download (?:The )?California Post App[\s\S]*?(?:Sign up here!|Download here!|$)/gi, '')
      .replace(/Download (?:The )?[A-Za-z\s]+ App, follow us on social[\s\S]*?(?:Sign up here!|Download here!|$)/gi, '')
      .replace(/(?:California Post|New York Post|Page Six)\s+(?:News|Sports|Opinion|Newsletters|App)[\s\S]*?(?:Sign up here!|Download here!|\n\n|$)/gi, '')
      .replace(/(?:Sign up here!|Download here!|Home delivery:)[^\n]*/gi, '')
      .replace(/Page Six Hollywood:?[^\n]*/gi, '')
      /** Remove viral engagement spam callouts */
      .replace(/(?:The story is still unfolding[^\n]*|Type\s*["“']?YES["”']?[^\n]*|Comment\s*["“']?YES["”']?[^\n]*|Drop a\s*["“']?YES["”']?[^\n]*|Follow for part\s*\d+[^\n]*|Like and follow for part\s*\d+[^\n]*)/gi, '')
      /** Remove disclaimer at the very end if present */
      .replace(/Disclaimer:\s*This story is fictional[\s\S]*$/i, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return text;
  }

  /**
   * Extract the opening Part 1 / Hook of the story for the Facebook Fanpage post.
   * Takes the first section (e.g. up to Part 2 or ~200-300 words) ending cleanly at a sentence.
   */
  ztteam_extractPart1Hook(content: string, maxChars: number = 1000): string {
    if (!content) return '';

    /** If the story is explicitly marked with Part 1 and Part 2 */
    const part2Match = content.match(/Part\s*2\s*[:\-]/i);
    if (part2Match && part2Match.index && part2Match.index > 100) {
      let part1 = content.substring(0, part2Match.index).trim();
      /** Remove the Part 1: heading from beginning if present */
      part1 = part1.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();
      if (part1.length <= 1500) {
        return part1;
      }
    }

    /** Otherwise take the first few paragraphs up to maxChars, ending at a sentence boundary */
    let trimmed = content.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();
    if (trimmed.length <= maxChars) {
      return trimmed;
    }

    const slice = trimmed.substring(0, maxChars);
    const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
    if (lastPeriod > 200) {
      return slice.substring(0, lastPeriod + 1).trim();
    }

    return slice.trim() + '...';
  }

  /**
   * Extract Part 1 (Hook for Caption) and Part 2 (Continuation for First Comment)
   * Tách câu chuyện thành 2 phần: Part 1 cho caption bài đăng và Part 2 cho bình luận lồng nhau.
   */
  ztteam_extractStoryParts(
    content: string,
    maxPart1Chars: number = 900,
    maxPart2Chars: number = 700
  ): { part1: string; part2: string } {
    if (!content) return { part1: '', part2: '' };

    let cleaned = content.replace(/^Part\s*1\s*[:\-]\s*/i, '').trim();

    /** 1. Trường hợp bài viết có đánh dấu Part 1 và Part 2 rõ ràng */
    const part2Regex = /Part\s*2\s*[:\-]/i;
    const part2Match = cleaned.match(part2Regex);

    if (part2Match && part2Match.index && part2Match.index > 100) {
      let part1 = cleaned.substring(0, part2Match.index).trim();
      let remainder = cleaned.substring(part2Match.index).trim();

      /** Loại bỏ tiêu đề Part 2: ở đầu đoạn */
      remainder = remainder.replace(/^Part\s*2\s*[:\-]\s*/i, '').trim();

      /** Kiểm tra nếu có Part 3 để không lấy tràn sang Part 3 */
      const part3Match = remainder.match(/Part\s*3\s*[:\-]/i);
      let part2Raw = part3Match && part3Match.index ? remainder.substring(0, part3Match.index).trim() : remainder;

      /** Giới hạn Part 2 vừa đủ dài theo quy chuẩn Facebook, kết thúc trọn vẹn tại dấu câu */
      let part2 = part2Raw;
      if (part2.length > maxPart2Chars) {
        const slice = part2.substring(0, maxPart2Chars);
        const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPeriod > 150) {
          part2 = slice.substring(0, lastPeriod + 1).trim();
        } else {
          part2 = slice.trim() + '...';
        }
      }

      return { part1, part2 };
    }

    /** 2. Trường hợp câu chuyện liền mạch không có chữ Part 1, Part 2 */
    let part1 = cleaned;
    let remainder = '';

    if (cleaned.length > maxPart1Chars) {
      const slice = cleaned.substring(0, maxPart1Chars);
      const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
      if (lastPeriod > 200) {
        part1 = slice.substring(0, lastPeriod + 1).trim();
        remainder = cleaned.substring(lastPeriod + 1).trim();
      } else {
        part1 = slice.trim();
        remainder = cleaned.substring(maxPart1Chars).trim();
      }
    }

    let part2 = '';
    if (remainder) {
      if (remainder.length > maxPart2Chars) {
        const slice = remainder.substring(0, maxPart2Chars);
        const lastPeriod = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('!'), slice.lastIndexOf('?'));
        if (lastPeriod > 150) {
          part2 = slice.substring(0, lastPeriod + 1).trim();
        } else {
          part2 = slice.trim() + '...';
        }
      } else {
        part2 = remainder;
      }
    }

    return { part1, part2 };
  }

  async ztteam_fetchUrlData(url: string): Promise<ZTTeamFetchResult> {
    try {
      /** Basic validation */
      new URL(url);
    } catch {
      throw new HttpException("URL không hợp lệ", HttpStatus.BAD_REQUEST);
    }

    try {
      const html = await this.ztteam_fetchHtml(url);

      /** Check if Cloudflare anti-bot page returned */
      if (
        html.includes('Attention Required! | Cloudflare') ||
        html.includes('cf-wrapper') ||
        html.includes('Sorry, you have been blocked')
      ) {
        this.logger.warn(`Cloudflare block detected on ${url}. Switching to bypass proxy...`);
        return await this.ztteam_fetchViaBypassProxy(url);
      }

      const $ = cheerio.load(html);

      let image = this.ztteam_extractOgImage($);
      if (image && image.startsWith('data:')) {
        image = null;
      }
      const siteName = this.ztteam_extractSiteName($);
      let { title, content, contentHtml, excerpt } = this.ztteam_parseReadability(
        html,
        url,
      );

      const cleanH1 = $('h1').first().text().trim();
      const ogTitle = $('meta[property="og:title"]').attr('content')?.trim();
      if (cleanH1 && cleanH1.length >= 10) {
        title = cleanH1;
      } else if (ogTitle && ogTitle.length >= 10) {
        title = ogTitle;
      }

      /** Ưu tiên các selector chứa bài viết chính xác, loại bỏ các wrapper ảnh/video ngoài lề */
      const customContentEl =
        $('.single__content.entry-content').length ? $('.single__content.entry-content') :
        ($('.entry-content:not(.featured-image)').length ? $('.entry-content:not(.featured-image)') :
        ($('.article-content').length ? $('.article-content') :
        ($('.entry-content').length ? $('.entry-content').last() :
        ($('div[itemprop="articleBody"]').length ? $('div[itemprop="articleBody"]') : null))));

      if (customContentEl) {
        contentHtml = this.ztteam_cleanHtmlKeepImages(customContentEl.html() || '', url);
      } else if (contentHtml) {
        contentHtml = this.ztteam_cleanHtmlKeepImages(contentHtml, url);
      } else {
        contentHtml = this.ztteam_cleanHtmlKeepImages(html, url);
      }

      const content$ = cheerio.load(contentHtml);
      const paragraphs: string[] = [];
      content$('p').each((_, p) => {
        const txt = content$(p).text().trim().replace(/\s+/g, ' ');
        if (txt && txt.length > 10) {
          paragraphs.push(txt);
        }
      });

      if (paragraphs.length >= 2) {
        content = paragraphs.join('\n\n');
      } else {
        content = content$.text().replace(/\t/g, ' ').replace(/[ ]{2,}/g, ' ').replace(/\. ([A-Z])/g, '.\n\n$1').trim();
      }
      content = this.ztteam_cleanStoryContent(content);

      let images: string[] = [];
      content$('img').each((_, el) => {
        let src = content$(el).attr('src');
        if (src && src.startsWith('http') && !src.startsWith('data:')) {
          images.push(src);
        }
      });

      const isUnwantedCover = (u: string | null | undefined): boolean => {
        if (!u) return true;
        const lower = u.toLowerCase();
        return (
          lower.includes('collage') ||
          lower.includes('newspress-collage') ||
          lower.includes('video-player') ||
          lower.includes('player-overlay') ||
          lower.includes('header-banner') ||
          lower.includes('placeholder') ||
          lower.includes('default-image') ||
          lower.includes('logo') ||
          lower.includes('avatar')
        );
      };

      if (image && isUnwantedCover(image)) {
        image = null;
      }

      images = images.filter(img => !isUnwantedCover(img));

      if (!image && images.length > 0) {
        image = images[0];
      }

      if (image) {
        const getBaseImg = (u: string) => {
          try {
            const urlObj = new URL(u);
            return urlObj.origin + urlObj.pathname.replace(/-\d+x\d+(?=\.[a-zA-Z0-9]+$)/, '');
          } catch(e) { return u; }
        };
        const baseOg = getBaseImg(image);
        images = images.filter(img => getBaseImg(img) !== baseOg);
      }

      /** ZTTeam Gatekeeper: Kiểm duyệt chất lượng tiêu đề và nội dung */
      const validation = this.ztteam_validateStoryArticle(title, content, url);
      if (!validation.isValid) {
        throw new HttpException(`Không phải bài viết hợp lệ (${validation.reason})`, HttpStatus.BAD_REQUEST);
      }

      const cleanHtmlWithImages = contentHtml;

      return {
        title,
        image,
        images: [...new Set(images)],
        content,
        contentHtml,
        cleanHtmlWithImages,
        excerpt,
        siteName: siteName || this.ztteam_extractDomain(url),
        url,
      };
    } catch (directErr: any) {
      /** Nếu lỗi xuất phát từ việc vi phạm tiêu chuẩn bài viết (trang chuyên mục/rác), ném lỗi luôn, không gọi proxy */
      if (
        directErr instanceof HttpException &&
        directErr.getStatus() === HttpStatus.BAD_REQUEST &&
        directErr.message?.includes('Không phải bài viết hợp lệ')
      ) {
        throw directErr;
      }

      this.logger.warn(`Direct fetch failed for ${url} (${directErr.message}). Automatically switching to bypass proxy...`);
      return await this.ztteam_fetchViaBypassProxy(url);
    }
  }

  /**
   * Extract article links from a category or archive URL via Jina Proxy
   * when the source website is protected by Cloudflare or blocks Vietnam IPs.
   */
  async ztteam_extractArticleLinksViaProxy(categoryUrl: string): Promise<string[]> {
    this.logger.log(`Extracting article links via bypass proxy for category: ${categoryUrl}`);
    try {
      const proxyUrl = `https://r.jina.ai/${categoryUrl}`;
      const response = await fetch(proxyUrl, {
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) {
        throw new Error(`Proxy category fetch failed with status: ${response.status}`);
      }

      const text = await response.text();
      const baseDomain = this.ztteam_extractDomain(categoryUrl);
      const articleUrls = new Set<string>();

      /** Find all candidate URLs in markdown parentheses (supports both [title](url) and nested [![img](img_url) title](article_url)) */
      const urlRegex = /\((https?:\/\/[^\s\)]+)\)/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const linkHref = match[1];
        try {
          if (this.ztteam_isArticleUrl(linkHref, baseDomain)) {
            articleUrls.add(linkHref);
          }
        } catch (e) {
          /** Ignore invalid URLs */
        }
      }

      const results = Array.from(articleUrls);
      this.logger.log(`Found ${results.length} article links via bypass proxy on ${categoryUrl}`);
      return results;
    } catch (e: any) {
      this.logger.error(`Failed to extract article links via proxy: ${e.message}`);
      return [];
    }
  }

  /**
   * ZTTeam: Tải và lưu trữ ảnh gốc từ website nguồn vào ổ cứng VPS làm dự phòng an toàn
   */
  async ztteam_downloadAndSaveSourceImage(imageUrl: string, storyTitle: string): Promise<{ localPath: string; storageUrl: string }> {
    try {
      const storageDir = ztteam_getSourceOriginalsPath();
      if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
      }

      /** Xác định đuôi mở rộng của file ảnh */
      let ext = 'jpg';
      try {
        const u = new URL(imageUrl);
        const p = u.pathname.toLowerCase();
        if (p.endsWith('.png')) ext = 'png';
        else if (p.endsWith('.webp')) ext = 'webp';
        else if (p.endsWith('.jpeg')) ext = 'jpeg';
      } catch (e) {
        /** Mặc định là jpg */
      }

      const filename = `source_img_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`;
      const localPath = path.join(storageDir, filename);

      this.logger.log(`Downloading source original image for "${storyTitle}": ${imageUrl}`);

      let response = await fetch(imageUrl, {
        signal: AbortSignal.timeout(20000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        this.logger.warn(`Direct image download returned status ${response.status}. Retrying via proxy wsrv.nl...`);
        const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(imageUrl)}`;
        response = await fetch(proxyUrl, {
          signal: AbortSignal.timeout(25000),
        });
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status} when downloading image`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length < 1000) {
        throw new Error('Downloaded image file is too small or corrupted (< 1KB)');
      }

      fs.writeFileSync(localPath, buffer);

      const storageUrl = `/storage/images/source-originals/${filename}`;
      this.logger.log(`Successfully saved source original image: ${storageUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);

      return {
        localPath,
        storageUrl,
      };
    } catch (err: any) {
      this.logger.error(`Failed to download and save source original image from ${imageUrl}: ${err.message}`);
      throw err;
    }
  }

  /**
   * ZTTeam: Phát hiện và trích xuất cấu trúc phân trang & Load More từ HTML của trang
   */
  ztteam_discoverPagination(html: string, pageUrl: string): ZTTeamPaginationDiscovery {
    const $ = cheerio.load(html);
    let nextPageUrl: string | null = null;
    const allPageUrls = new Set<string>();
    let wpRestApiEndpoint: string | null = null;
    let rssFeedUrl: string | null = null;
    let loadMoreData: any = null;

    try {
      const baseUrl = new URL(pageUrl);

      // 1. Phát hiện endpoint WP REST API từ thẻ link
      const wpApiLink = $('link[rel="https://api.w.org/"]').attr('href');
      if (wpApiLink) {
        wpRestApiEndpoint = new URL(wpApiLink, baseUrl.origin).href;
      }

      // 2. Phát hiện link RSS Feed từ thẻ link
      const rssLink =
        $('link[type="application/rss+xml"]').first().attr('href') ||
        $('link[type="application/atom+xml"]').first().attr('href');
      if (rssLink) {
        rssFeedUrl = new URL(rssLink, baseUrl.origin).href;
      }

      // 3. Link trang kế tiếp từ thẻ rel="next"
      const relNext = $('link[rel="next"]').attr('href') || $('a[rel="next"]').attr('href');
      if (relNext) {
        try {
          nextPageUrl = new URL(relNext, baseUrl.origin).href;
        } catch {}
      }

      // 4. Tìm link kế tiếp từ class pagination phổ biến
      const nextSelectors = [
        'a.next', 'a.next-page', 'a.page-numbers.next', '.pagination .next a',
        '.nav-links .next a', '.pager-next a', 'a[class*="pagination-next"]',
        'a[class*="next-page"]', 'a[class*="page-link-next"]', 'a[rel="next"]',
        'li.next a', '.pagination-next a', '.pagination__next a'
      ];
      if (!nextPageUrl) {
        for (const sel of nextSelectors) {
          const href = $(sel).attr('href');
          if (href && href !== '#' && !href.startsWith('javascript:')) {
            try {
              nextPageUrl = new URL(href, baseUrl.origin).href;
              break;
            } catch {}
          }
        }
      }

      // 5. Tìm link trang kế tiếp dựa trên văn bản hiển thị
      if (!nextPageUrl) {
        $('a').each((_, el) => {
          if (nextPageUrl) return;
          const text = $(el).text().trim().toLowerCase();
          const href = $(el).attr('href');
          if (!href || href === '#' || href.startsWith('javascript:')) return;

          if (
            text === 'next' ||
            text === 'next page' ||
            text === 'older posts' ||
            text === 'older' ||
            text === 'trang sau' ||
            text === 'trang tiếp' ||
            text === 'tiếp theo' ||
            text === 'tiếp' ||
            text === '»' ||
            text === '›' ||
            text === '>'
          ) {
            try {
              nextPageUrl = new URL(href, baseUrl.origin).href;
            } catch {}
          }
        });
      }

      // 6. Thu thập toàn bộ các link trang cụ thể từ container phân trang
      const paginationContainerSelectors = [
        '.pagination a', '.page-numbers a', 'a.page-numbers',
        '.nav-links a', '.pager a', '.wp-pagenavi a',
        '[class*="pagination"] a', '[class*="pagenavi"] a', '[class*="page-nav"] a',
        'nav[aria-label*="pagination" i] a', 'nav[aria-label*="page" i] a'
      ];

      $(paginationContainerSelectors.join(', ')).each((_, el) => {
        const href = $(el).attr('href');
        if (!href || href === '#' || href.startsWith('javascript:')) return;
        try {
          const resolved = new URL(href, baseUrl.origin).href;
          if (
            resolved.includes(baseUrl.hostname) &&
            (resolved.includes('/page/') ||
              resolved.includes('page=') ||
              resolved.includes('paged=') ||
              resolved.includes('/p/') ||
              resolved.includes('page-'))
          ) {
            allPageUrls.add(resolved);
          }
        } catch {}
      });

      // 7. Nhận diện nút "Load More" hoặc trigger AJAX
      const loadMoreSelectors = [
        'button[class*="load-more"]', 'a[class*="load-more"]',
        'button[id*="load-more"]', 'a[id*="load-more"]',
        'button[class*="loadmore"]', 'a[class*="loadmore"]',
        '[data-loadmore]', '.btn-load-more', '.load-more-posts',
        '[data-action*="load_more"]', '[data-action*="loadmore"]'
      ];

      for (const sel of loadMoreSelectors) {
        const btn = $(sel).first();
        if (btn.length > 0) {
          const dataUrl = btn.attr('data-url') || btn.attr('data-endpoint') || btn.attr('href');
          const dataAction = btn.attr('data-action');
          const dataPage = btn.attr('data-page') || btn.attr('data-paged');
          const dataMaxPage = btn.attr('data-max-page') || btn.attr('data-total-pages');
          const dataQuery = btn.attr('data-query');

          loadMoreData = {
            url: dataUrl && !dataUrl.startsWith('#') && !dataUrl.startsWith('javascript:')
              ? new URL(dataUrl, baseUrl.origin).href
              : undefined,
            action: dataAction || undefined,
            page: dataPage ? parseInt(dataPage, 10) : undefined,
            maxPage: dataMaxPage ? parseInt(dataMaxPage, 10) : undefined,
            query: dataQuery || undefined,
          };
          break;
        }
      }

      // Kiểm tra script nội dòng xem có admin-ajax.php không
      if (!loadMoreData) {
        $('script').each((_, el) => {
          const scriptText = $(el).html() || '';
          if (scriptText.includes('admin-ajax.php')) {
            const m = scriptText.match(/["']([^"']*admin-ajax\.php[^"']*)["']/);
            if (m && m[1]) {
              try {
                const ajaxUrl = new URL(m[1].replace(/\\/g, ''), baseUrl.origin).href;
                loadMoreData = { ajaxUrl };
              } catch {}
            }
          }
        });
      }
    } catch (err: any) {
      this.logger.warn(`Lỗi khi phân tích phân trang tại ${pageUrl}: ${err.message}`);
    }

    return {
      nextPageUrl,
      allPageUrls: Array.from(allPageUrls),
      loadMoreData,
      wpRestApiEndpoint,
      rssFeedUrl,
    };
  }

  /**
   * ZTTeam: Bóc tách toàn bộ link bài viết chuẩn từ mã HTML của một trang
   * Không giới hạn 15 bài, giữ nguyên toàn bộ bài viết hợp lệ tìm thấy
   */
  ztteam_extractArticleLinksFromHtml(html: string, pageUrl: string): string[] {
    const $ = cheerio.load(html);
    const baseUrl = new URL(pageUrl);
    const extractedSet = new Set<string>();

    // Loại bỏ các thành phần rác không chứa bài viết
    $('header, footer, nav, aside, .sidebar, .widget, .menu, #menu, .nav-menu, .navigation, .comment-respond, .comments, .site-header, .site-footer, .top-bar, .sub-menu, .dropdown-menu, .breadcrumb, .breadcrumbs, .related-posts, .author-box').remove();

    // Nhóm 1: Các thẻ link trong bài viết, tiêu đề bài viết và ảnh đại diện
    const primarySelectors = [
      'article a[href]',
      'h1 a[href]', 'h2 a[href]', 'h3 a[href]', 'h4 a[href]',
      '.entry-title a[href]', '.post-title a[href]', '.card-title a[href]', '.story-card a[href]',
      '.article-card a[href]', '.post-item a[href]', '.blog-post a[href]', '.story-item a[href]',
      '.item-title a[href]', '.story-link a[href]', 'a.story-link', 'a.post-link', 'a.entry-link',
      '.entry-image a[href]', '.post-thumbnail a[href]', '.featured-image a[href]', '.card-img a[href]',
      '.card a[href]', '.item a[href]'
    ];

    $(primarySelectors.join(', ')).each((_, el) => {
      let href = $(el).attr('href');
      if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
      try {
        const fullUrl = new URL(href, baseUrl.origin).href;
        const cleanUrl = fullUrl.split('#')[0];
        if (this.ztteam_isArticleUrl(cleanUrl, baseUrl.hostname)) {
          extractedSet.add(cleanUrl);
        }
      } catch {}
    });

    // Nhóm 2: Quét toàn bộ link trong vùng nội dung chính nếu chưa tìm đủ
    const containerSelectors = [
      'main a[href]', '#content a[href]', '.content a[href]', '#main a[href]',
      '.main-content a[href]', '.site-content a[href]', '.posts a[href]',
      '.articles a[href]', '.stories a[href]', '.archive-posts a[href]',
      'body a[href]'
    ];

    for (const sel of containerSelectors) {
      if (extractedSet.size >= 80) break;
      $(sel).each((_, el) => {
        let href = $(el).attr('href');
        if (!href || href === '#' || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        try {
          const fullUrl = new URL(href, baseUrl.origin).href;
          const cleanUrl = fullUrl.split('#')[0];
          if (this.ztteam_isArticleUrl(cleanUrl, baseUrl.hostname)) {
            extractedSet.add(cleanUrl);
          }
        } catch {}
      });
    }

    return Array.from(extractedSet);
  }

  /**
   * ZTTeam: Lấy danh sách link bài viết từ WordPress REST API (sạch, chuẩn và cực nhanh)
   */
  async ztteam_fetchWpRestApiPosts(siteUrl: string, pageNum: number = 1, perPage: number = 20): Promise<{ articles: string[]; totalPages: number } | null> {
    try {
      const u = new URL(siteUrl);
      const endpoint = `${u.origin}/wp-json/wp/v2/posts?page=${pageNum}&per_page=${perPage}&_fields=id,link,title`;
      this.logger.log(`[WP REST API] Đang lấy bài viết: ${endpoint}`);

      const response = await fetch(endpoint, {
        signal: AbortSignal.timeout(15000),
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const totalPagesHeader = response.headers.get('x-wp-totalpages');
      const totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;

      const posts = await response.json();
      if (!Array.isArray(posts) || posts.length === 0) {
        return { articles: [], totalPages };
      }

      const articles: string[] = [];
      for (const p of posts) {
        if (p.link) {
          articles.push(p.link);
        }
      }

      return { articles, totalPages };
    } catch {
      return null;
    }
  }

  /**
   * ZTTeam: Lấy danh sách link bài viết từ nguồn RSS Feed qua từng trang
   */
  async ztteam_fetchRssArticles(feedUrl: string, pageNum: number = 1): Promise<string[]> {
    const articleUrls = new Set<string>();
    const baseUrl = new URL(feedUrl);

    let targetUrl = feedUrl;
    if (pageNum > 1) {
      if (feedUrl.includes('?')) {
        targetUrl = `${feedUrl}&paged=${pageNum}`;
      } else {
        targetUrl = `${feedUrl.replace(/\/+$/, '')}/?paged=${pageNum}`;
      }
    }

    try {
      this.logger.log(`[RSS Feed] Đang bóc tách feed: ${targetUrl} (Trang ${pageNum})`);
      const feed = await this.rssParser.parseURL(targetUrl);
      if (feed && feed.items && feed.items.length > 0) {
        for (const item of feed.items) {
          if (item.link) {
            const cleanUrl = item.link.split('#')[0].trim();
            if (this.ztteam_isArticleUrl(cleanUrl, baseUrl.hostname)) {
              articleUrls.add(cleanUrl);
            }
          }
        }
      }
    } catch (directErr: any) {
      this.logger.warn(`Lỗi lấy RSS trực tiếp từ ${targetUrl}: ${directErr.message}`);
      try {
        const altUrl = pageNum > 1 ? `${feedUrl.replace(/\/+$/, '')}/feed/?paged=${pageNum}` : feedUrl;
        const xml = await this.ztteam_fetchHtml(altUrl);
        const parsedFeed = await this.rssParser.parseString(xml);
        if (parsedFeed && parsedFeed.items) {
          for (const item of parsedFeed.items) {
            if (item.link) {
              const cleanUrl = item.link.split('#')[0].trim();
              if (this.ztteam_isArticleUrl(cleanUrl, baseUrl.hostname)) {
                articleUrls.add(cleanUrl);
              }
            }
          }
        }
      } catch (xmlErr: any) {
        this.logger.debug(`Bóc tách RSS fallback không thành công: ${xmlErr.message}`);
      }
    }

    return Array.from(articleUrls);
  }

  /**
   * ZTTeam: Kích hoạt gọi endpoint Load More AJAX của theme WordPress
   */
  async ztteam_fetchLoadMoreAjaxArticles(loadMoreData: any, baseUrl: string, pageNum: number): Promise<string[]> {
    try {
      const ajaxUrl = loadMoreData.ajaxUrl || `${new URL(baseUrl).origin}/wp-admin/admin-ajax.php`;
      const action = loadMoreData.action || 'load_more_posts';

      const params = new URLSearchParams();
      params.append('action', action);
      params.append('page', String(pageNum));
      params.append('paged', String(pageNum));
      if (loadMoreData.query) {
        params.append(
          'query',
          typeof loadMoreData.query === 'string' ? loadMoreData.query : JSON.stringify(loadMoreData.query)
        );
      }

      this.logger.log(`[Load More AJAX] Gọi endpoint: ${ajaxUrl} trang ${pageNum} với action=${action}`);
      const response = await fetch(ajaxUrl, {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        body: params.toString(),
      });

      if (!response.ok) return [];

      const rawText = await response.text();
      let htmlToParse = rawText;
      try {
        const json = JSON.parse(rawText);
        htmlToParse = json.content || json.data || json.html || rawText;
      } catch {}

      return this.ztteam_extractArticleLinksFromHtml(htmlToParse, baseUrl);
    } catch (e: any) {
      this.logger.debug(`Load More AJAX request thất bại: ${e.message}`);
      return [];
    }
  }

  /**
   * ZTTeam: Tạo danh sách các ứng viên URL phân trang linh hoạt (hỗ trợ WordPress, CMS query param, path permalink)
   */
  ztteam_generateCandidatePageUrls(sourceUrl: string, pageNum: number): string[] {
    if (pageNum <= 1) return [sourceUrl];
    const candidates: string[] = [];

    try {
      const urlObj = new URL(sourceUrl);
      const origin = urlObj.origin;
      const pathname = urlObj.pathname;
      const search = urlObj.search;
      const cleanPath = pathname.replace(/\/+$/, '');

      // Mẫu 1: URL nguồn đã có sẵn tham số page= hoặc paged= -> Tăng số trang
      if (/[?&](?:page|paged)=(\d+)/i.test(sourceUrl)) {
        candidates.push(sourceUrl.replace(/([?&](?:page|paged)=)\d+/i, `$1${pageNum}`));
      }

      // Mẫu 2: Permalink dạng WordPress /page/N/
      if (/\/page\/\d+\/?$/i.test(pathname)) {
        candidates.push(`${origin}${pathname.replace(/\/page\/\d+\/?$/i, `/page/${pageNum}/`)}${search}`);
      } else {
        candidates.push(`${origin}${cleanPath}/page/${pageNum}/${search}`);
      }

      // Mẫu 3: Query parameter ?paged=N hoặc &paged=N
      if (search) {
        const searchParams = new URLSearchParams(search);
        searchParams.set('paged', String(pageNum));
        candidates.push(`${origin}${pathname}?${searchParams.toString()}`);
        searchParams.delete('paged');
        searchParams.set('page', String(pageNum));
        candidates.push(`${origin}${pathname}?${searchParams.toString()}`);
      } else {
        candidates.push(`${origin}${pathname}?paged=${pageNum}`);
        candidates.push(`${origin}${pathname}?page=${pageNum}`);
      }

      // Mẫu 4: Không có dấu gạch chéo cuối /page/N
      candidates.push(`${origin}${cleanPath}/page/${pageNum}${search}`);

      // Mẫu 5: /p/N/ hoặc /page-N/
      candidates.push(`${origin}${cleanPath}/p/${pageNum}/${search}`);
      candidates.push(`${origin}${cleanPath}/page-${pageNum}/${search}`);
    } catch {
      candidates.push(sourceUrl);
    }

    return Array.from(new Set(candidates));
  }
}

