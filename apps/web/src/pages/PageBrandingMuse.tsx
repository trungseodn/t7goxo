import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useZTTeamFacebookStore } from '../stores/facebookStore';
import { useUIStore } from '../stores/uiStore';
import CustomDropdown from '../components/CustomDropdown';
import api from '../services/api';

/** Danh sách Preset Chủ Đề được tối ưu hóa cho Muse.ai & Meta Graph API (100% Native English) */
const THEME_PRESETS = [
  {
    id: 'story_narrative',
    name: '📖 Kể Chuyện Đời Sống & Cảm Xúc (Story)',
    desc: 'Tone màu điện ảnh ấm áp, câu chuyện đời sống, nhân văn, tình cảm chạm đến trái tim.',
    avatarPrompt: 'Create a 1:1 square emotive profile picture avatar for a narrative storytelling page named "{PAGE_NAME}". Theme: heartfelt human stories, life drama and emotional narrative, warm golden hour lighting, deep atmospheric textures, elegant artistic symbol, 8k resolution, photorealistic.',
    coverPrompt: 'Create a breathtaking 16:9 cinematic cover banner for "{PAGE_NAME}". Theme: emotional storytelling journey, human life narrative, picturesque cinematic landscape with warm nostalgic lighting, deeply evocative atmosphere, 8k masterpiece.',
    bioTemplate: '{PAGE_NAME} — Heartfelt stories, quiet moments, and the human spirit.',
    descTemplate: 'Welcome to {PAGE_NAME}. We chronicle everyday human journeys, poignant personal reflections, and heartfelt narratives that touch the soul and inspire empathy.',
  },
  {
    id: 'drama_story',
    name: '🎭 Kịch Tính & Góc Khuất Cuộc Đời (Drama Story)',
    desc: 'Không khí ly kỳ, kịch tính, những tình huống trắc trở, xung đột và bài học cuộc sống.',
    avatarPrompt: 'Create a 1:1 square profile picture avatar for a drama storytelling page named "{PAGE_NAME}". Theme: life drama, emotional tension, unexpected twists, cinematic chiaroscuro lighting, high contrast, subtle iconic symbol, photorealistic, 8k.',
    coverPrompt: 'Create an intense 16:9 cinematic widescreen Facebook cover banner for "{PAGE_NAME}". Theme: compelling life drama, emotional confrontation, moody atmospheric lighting, cinematic storytelling composition, photorealistic, 8k resolution.',
    bioTemplate: '{PAGE_NAME} — Unvarnished life drama, intense twists, and raw human truths.',
    descTemplate: '{PAGE_NAME} captures intense life conflicts, unexpected twists of fate, and compelling real-world dramas exploring the consequences of human decisions.',
  },
  {
    id: 'inspiring_story',
    name: '✨ Câu Chuyện Truyền Cảm Hứng (Inspiring Story)',
    desc: 'Ánh sáng rực rỡ, niềm hy vọng, vượt khó vươn lên và những giá trị sống tích cực.',
    avatarPrompt: 'Create a 1:1 square uplifting profile picture avatar for an inspirational storytelling page named "{PAGE_NAME}". Theme: hope, resilience, overcoming adversity, bright cinematic sunrise lighting, inspiring aesthetic emblem, photorealistic, 8k.',
    coverPrompt: 'Create an awe-inspiring 16:9 panoramic cinematic Facebook cover banner for "{PAGE_NAME}". Theme: journey of hope and triumph, breathtaking horizon, golden morning glow, cinematic storytelling, 8k resolution.',
    bioTemplate: '{PAGE_NAME} — True tales of courage, resilience, and triumph against all odds.',
    descTemplate: '{PAGE_NAME} is your daily source of hope and motivation. Discover extraordinary journeys of ordinary people rising above adversity and changing their destiny.',
  },
  {
    id: 'history_mystery',
    name: '📜 Lịch Sử & Bí Ẩn Cổ Xưa (History)',
    desc: 'Tư liệu cổ kính, bóng tối điện ảnh, chi tiết huyền bí và không gian lưu trữ tài liệu.',
    avatarPrompt: 'Create a 1:1 square iconic profile picture avatar for a storytelling page named "{PAGE_NAME}". Theme: historical mysteries, lost archives, and forgotten secrets. Cinematic dramatic lighting, rich atmospheric textures, deep shadows, 8k resolution, minimalist emblem style, photorealistic.',
    coverPrompt: 'Create a breathtaking cinematic 16:9 widescreen Facebook cover banner for "{PAGE_NAME}". Theme: ancient historical archive, mysterious documents, dramatic storytelling mood, rich vintage textures, volumetric lighting, photorealistic masterpiece, 8k.',
    bioTemplate: '{PAGE_NAME} — Unearthing forgotten annals, ancient relics, and lost legends.',
    descTemplate: 'Step into the past with {PAGE_NAME}. From enigmatic historical events to lost empires and forgotten manuscripts, we bring history\'s greatest mysteries to life.',
  },
  {
    id: 'unsolved_cases',
    name: '🔍 Hồ Sơ Vụ Án & Ly Kỳ (Mystery Case)',
    desc: 'Không khí trinh thám, điều tra bí mật, ánh đèn neon mờ ảo, bóng đêm kịch tính.',
    avatarPrompt: 'Create a 1:1 square profile picture avatar for a mystery investigation page named "{PAGE_NAME}". Theme: unsolved cold cases, detective archives, dark noir aesthetics. High contrast, cinematic chiaroscuro lighting, subtle emblem symbol, photorealistic, 8k.',
    coverPrompt: 'Create an intense 16:9 cinematic widescreen Facebook cover banner for "{PAGE_NAME}". Theme: detective case files, investigative journalism, atmospheric fog, moody dramatic street lighting, photorealistic cinematic storytelling, 8k resolution.',
    bioTemplate: '{PAGE_NAME} — Unsolved cold cases, detective archives, and gripping mysteries.',
    descTemplate: 'Investigating the world\'s most baffling cold cases, historical investigations, and forensic mysteries. Follow {PAGE_NAME} as we search for truth in the shadows.',
  },
  {
    id: 'modern_editorial',
    name: '⚡ Khám Phá & Đời Sống Hiện Đại',
    desc: 'Phong cách hiện đại, tương phản cao, góc nhìn báo chí và khám phá thế giới.',
    avatarPrompt: 'Create a 1:1 modern minimalist profile picture avatar for a storytelling media page named "{PAGE_NAME}". Bold visual identity, clean typography badge, striking contrast, sleek studio lighting, 8k resolution.',
    coverPrompt: 'Create an ultra-modern 16:9 documentary editorial cover banner for "{PAGE_NAME}". Dynamic composition, global perspectives, high-impact cinematic aesthetics, clean visual storytelling, 8k.',
    bioTemplate: '{PAGE_NAME} — Modern culture, global phenomenons, and deep-dive perspectives.',
    descTemplate: '{PAGE_NAME} delivers thought-provoking perspectives on contemporary life, cultural movements, and the stories shaping our rapidly evolving world.',
  },
  {
    id: 'custom',
    name: '✍️ Tùy Biến Tự Do',
    desc: 'Tự nhập câu lệnh prompt và mô tả chi tiết theo phong cách riêng của bạn.',
    avatarPrompt: '',
    coverPrompt: '',
    bioTemplate: '',
    descTemplate: '',
  },
];

export default function PageBrandingMuse() {
  const navigate = useNavigate();
  const { pages, ztteam_fetchPagesFromDB, isLoading } = useZTTeamFacebookStore();
  const { ztteam_showToast, ztteam_showConfirm } = useUIStore();

  /** State Điều hướng Tabs chính */
  const [activeTab, setActiveTab] = useState<1 | 2 | 3 | 4>(1);

  /** State Quản lý Mô tả & Tiểu sử Tiếng Anh (Tác Vụ Riêng Biệt - Tab 4) */
  const [bioThemeId, setBioThemeId] = useState<string>('story_narrative');
  const [bioTone, setBioTone] = useState<string>('Emotive, engaging and authentic');
  const [editingBio, setEditingBio] = useState<string>(THEME_PRESETS[0].bioTemplate);
  const [editingDesc, setEditingDesc] = useState<string>(THEME_PRESETS[0].descTemplate);
  const [pageDescriptionsMap, setPageDescriptionsMap] = useState<Record<string, { bio: string; description: string }>>({});
  const [isGeneratingBioAI, setIsGeneratingBioAI] = useState<boolean>(false);
  const [isApplyingBioToFb, setIsApplyingBioToFb] = useState<boolean>(false);
  const [previewPageForBio, setPreviewPageForBio] = useState<any>(null);
  const [bioSearchQuery, setBioSearchQuery] = useState<string>('');
  const [bioFilterStatus, setBioFilterStatus] = useState<'all' | 'missing' | 'has_bio'>('all');

  /** Bộ lọc BM & Tìm kiếm */
  const [selectedBm, setSelectedBm] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'missing_only' | 'missing_cover' | 'missing_avatar' | 'has_branding' | 'all'>('missing_only');

  /** Danh sách ID Page được chọn */
  const [selectedPageIds, setSelectedPageIds] = useState<string[]>([]);

  /** Cấu hình Prompt Studio */
  const [selectedThemeId, setSelectedThemeId] = useState<string>('story_narrative');
  const [customAvatarPrompt, setCustomAvatarPrompt] = useState<string>(THEME_PRESETS[0].avatarPrompt);
  const [customCoverPrompt, setCustomCoverPrompt] = useState<string>(THEME_PRESETS[0].coverPrompt);
  const [customBioTemplate, setCustomBioTemplate] = useState<string>(THEME_PRESETS[0].bioTemplate || '');
  const [customDescTemplate, setCustomDescTemplate] = useState<string>(THEME_PRESETS[0].descTemplate || '');
  const [autoApplyBioDesc, setAutoApplyBioDesc] = useState<boolean>(true);
  const [isSubmittingBioOnly, setIsSubmittingBioOnly] = useState<boolean>(false);
  const [includePageNameText, setIncludePageNameText] = useState<boolean>(true);
  const [autoApplyFacebook, setAutoApplyFacebook] = useState<boolean>(true);
  const [brandingTargetType, setBrandingTargetType] = useState<'both' | 'avatar' | 'cover'>('both');

  /** Trạng thái Hàng Đợi & Tiến Trình */
  const [queueStatus, setQueueStatus] = useState<any>(null);
  const [isSubmittingQueue, setIsSubmittingQueue] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activePreviewPage, setActivePreviewPage] = useState<any>(null);
  const [isApplyingFacebook, setIsApplyingFacebook] = useState<string | null>(null);

  /** Tải lại dữ liệu khi vào trang */
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await ztteam_fetchPagesFromDB();
      const res = await api.get('/facebook/pages/branding/queue-status');
      if (res.data?.success) {
        setQueueStatus(res.data);
      }
    } catch (e: any) {
      console.warn('Lỗi tải queue status:', e.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshData();
    /** Polling nhẹ trạng thái hàng đợi mỗi 10 giây nếu đang ở Tab 3 */
    const interval = setInterval(() => {
      api.get('/facebook/pages/branding/queue-status')
        .then(res => {
          if (res.data?.success) setQueueStatus(res.data);
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  /** Danh sách Business Manager duy nhất */
  const uniqueBusinesses = useMemo(() => {
    const bms = Array.from(new Set(pages.map(p => p.businessName).filter(Boolean)));
    return bms;
  }, [pages]);

  /** Danh sách Fanpage sau khi lọc */
  const filteredPages = useMemo(() => {
    return pages.filter(p => {
      if (p.isActive === false) return false;

      /** Lọc theo BM */
      if (selectedBm !== 'all' && p.businessName !== selectedBm) {
        return false;
      }

      /** Lọc theo Search */
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = (p.name || '').toLowerCase().includes(q);
        const matchId = (p.fb_page_id || p.id || '').includes(q);
        if (!matchName && !matchId) return false;
      }

      /** Lọc theo Trạng thái Nhận diện */
      const hasAvatar = !!p.brandingAvatarUrl;
      const hasCover = !!p.brandingCoverUrl;

      if (filterMode === 'missing_only') return !hasAvatar || !hasCover;
      if (filterMode === 'missing_cover') return !hasCover;
      if (filterMode === 'missing_avatar') return !hasAvatar;
      if (filterMode === 'has_branding') return hasAvatar && hasCover;

      return true;
    });
  }, [pages, selectedBm, searchQuery, filterMode]);

  /** Đổi Preset Chủ đề */
  const handleSelectThemePreset = (themeId: string) => {
    setSelectedThemeId(themeId);
    const preset = THEME_PRESETS.find(t => t.id === themeId);
    if (preset && themeId !== 'custom') {
      setCustomAvatarPrompt(preset.avatarPrompt);
      setCustomCoverPrompt(preset.coverPrompt);
      if (preset.bioTemplate) setCustomBioTemplate(preset.bioTemplate);
      if (preset.descTemplate) setCustomDescTemplate(preset.descTemplate);
    }
  };

  /** Xử lý Chọn tất cả các Page đang hiển thị */
  const handleToggleSelectAll = () => {
    const allFilteredIds = filteredPages.map(p => p.id);
    const isAllSelected = allFilteredIds.every(id => selectedPageIds.includes(id));
    if (isAllSelected) {
      setSelectedPageIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedPageIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  /** Xử lý Chọn / Bỏ chọn 1 Page */
  const handleToggleSelectPage = (pageId: string) => {
    setSelectedPageIds(prev => 
      prev.includes(pageId) ? prev.filter(id => id !== pageId) : [...prev, pageId]
    );
  };

  /** Xử lý đổi theme trong Tab 4 (Mô tả tiếng Anh) */
  const handleSelectBioThemePreset = (themeId: string) => {
    setBioThemeId(themeId);
    const preset = THEME_PRESETS.find(t => t.id === themeId);
    if (preset && themeId !== 'custom') {
      setEditingBio(preset.bioTemplate || '');
      setEditingDesc(preset.descTemplate || '');
    }
  };

  /** Áp dụng mẫu tiếng Anh vào danh sách Page đã chọn (Local Preview / Staging) */
  const handleApplyPresetToSelectedPages = () => {
    const targetPages = selectedPageIds.length > 0
      ? pages.filter(p => selectedPageIds.includes(p.id))
      : filteredPages;

    if (targetPages.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage để áp dụng mẫu', 'error');
      return;
    }

    const newMap = { ...pageDescriptionsMap };
    targetPages.forEach(p => {
      const bio = editingBio.replace(/\{PAGE_NAME\}/g, p.name).slice(0, 101);
      const desc = editingDesc.replace(/\{PAGE_NAME\}/g, p.name);
      newMap[p.id] = { bio, description: desc };
    });

    setPageDescriptionsMap(newMap);
    ztteam_showToast(`Đã áp dụng mẫu Tiếng Anh cho ${targetPages.length} Fanpage!`, 'success');
  };

  /** Sinh tự động Mô tả & Tiểu sử 100% Native English bằng AI (OpenAI / Gemini) */
  const handleAIGenerateDescriptions = async () => {
    const targetPages = selectedPageIds.length > 0
      ? pages.filter(p => selectedPageIds.includes(p.id))
      : filteredPages;

    if (targetPages.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage để sinh mô tả bằng AI', 'error');
      return;
    }

    const confirm = await ztteam_showConfirm(
      'Xác nhận Sinh Mô Tả Bằng AI (100% English)',
      `Hệ thống sẽ dùng AI phân tích tên và chủ đề của ${targetPages.length} Fanpage để viết Tiểu sử (Bio < 100 ký tự) và Mô tả chi tiết (Description) chuẩn tiếng Anh bản xứ.\n\n` +
      `- Chủ đề: ${THEME_PRESETS.find(t => t.id === bioThemeId)?.name || bioThemeId}\n` +
      `- Tone văn phong: ${bioTone}\n\n` +
      `Bạn có muốn bắt đầu sinh nội dung ngay?`
    );

    if (!confirm) return;

    try {
      setIsGeneratingBioAI(true);
      const res = await api.post('/facebook/pages/branding/ai-generate-descriptions', {
        pageIds: targetPages.map(p => p.id),
        theme: bioThemeId,
        tone: bioTone,
      });

      if (res.data?.success) {
        const newMap = { ...pageDescriptionsMap };
        if (res.data.items && Array.isArray(res.data.items)) {
          res.data.items.forEach((it: any) => {
            newMap[it.id] = { bio: it.bio, description: it.description };
          });
        }
        setPageDescriptionsMap(newMap);
        ztteam_showToast(res.data.message || `Đã sinh Mô tả bằng AI cho ${targetPages.length} Fanpage thành công!`, 'success');
        await refreshData();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi gọi AI sinh mô tả', 'error');
    } finally {
      setIsGeneratingBioAI(false);
    }
  };

  /** Đồng bộ trực tiếp Mô tả & Tiểu sử lên Meta Graph API */
  const handleBulkSyncDescriptionsToFacebook = async () => {
    const targetPages = selectedPageIds.length > 0
      ? pages.filter(p => selectedPageIds.includes(p.id))
      : filteredPages;

    if (targetPages.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage để cập nhật lên Facebook', 'error');
      return;
    }

    const confirm = await ztteam_showConfirm(
      'Đồng Bộ Lên Facebook Qua Graph API',
      `Bạn chuẩn bị gửi lệnh cập nhật Mô tả & Tiểu sử trực tiếp qua Meta Graph API cho ${targetPages.length} Fanpage.\n\n` +
      `- Toàn bộ nội dung cập nhật là 100% tiếng Anh.\n` +
      `- Giữ nguyên 100% Avatar và Ảnh bìa hiện hữu.\n\n` +
      `Bạn có muốn tiến hành đồng bộ ngay bây giờ?`
    );

    if (!confirm) return;

    try {
      setIsApplyingBioToFb(true);

      const itemsPayload = targetPages.map(p => {
        const currentData = pageDescriptionsMap[p.id];
        return {
          pageId: p.id,
          bio: currentData?.bio !== undefined ? currentData.bio : (p.brandingBio || editingBio.replace(/\{PAGE_NAME\}/g, p.name).slice(0, 101)),
          description: currentData?.description !== undefined ? currentData.description : (p.brandingDescription || editingDesc.replace(/\{PAGE_NAME\}/g, p.name)),
        };
      });

      const res = await api.post('/facebook/pages/branding/bulk-apply-descriptions', {
        theme: bioThemeId,
        items: itemsPayload,
      });

      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã đồng bộ Mô tả cho ${targetPages.length} Fanpage thành công!`, 'success');
        await refreshData();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi cập nhật lên Facebook', 'error');
    } finally {
      setIsApplyingBioToFb(false);
    }
  };

  /** Đồng bộ 1 Fanpage riêng lẻ */
  const handleSyncSinglePageBio = async (page: any) => {
    const currentData = pageDescriptionsMap[page.id];
    const bioToSend = currentData?.bio !== undefined ? currentData.bio : (page.brandingBio || editingBio.replace(/\{PAGE_NAME\}/g, page.name).slice(0, 101));
    const descToSend = currentData?.description !== undefined ? currentData.description : (page.brandingDescription || editingDesc.replace(/\{PAGE_NAME\}/g, page.name));

    try {
      const res = await api.post('/facebook/pages/branding/bulk-apply-descriptions', {
        items: [{
          pageId: page.id,
          bio: bioToSend,
          description: descToSend,
        }],
      });

      if (res.data?.success) {
        ztteam_showToast(`Đã cập nhật Mô tả cho Page "${page.name}" thành công!`, 'success');
        await refreshData();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi cập nhật lên Facebook', 'error');
    }
  };

    /** Đưa Fanpage đã chọn vào Hàng Đợi Muse */
  const handleQueueBrandingSubmit = async () => {
    const targetPages = selectedPageIds.length > 0 
      ? pages.filter(p => selectedPageIds.includes(p.id))
      : filteredPages;

    if (targetPages.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage để đưa vào hàng đợi', 'error');
      return;
    }

    const confirm = await ztteam_showConfirm(
      'Xác nhận Đưa vào Hàng Đợi Muse',
      `Bạn chuẩn bị đưa ${targetPages.length} Fanpage vào hàng đợi tạo nhận diện bằng Muse.ai.\n\n` +
      `- Định dạng: ${brandingTargetType === 'both' ? 'Cả Avatar (1:1) và Ảnh bìa (16:9)' : brandingTargetType === 'avatar' ? 'Chỉ Avatar (1:1)' : 'Chỉ Ảnh bìa (16:9)'}\n` +
      `- Tự động cập nhật Facebook: ${autoApplyFacebook ? 'BẬT' : 'TẮT (Chỉ lưu trữ)'}\n\n` +
      `Tiến trình sẽ được xử lý tự động khi Worker Muse trên máy tính hoạt động. Bạn có muốn tiếp tục?`
    );

    if (!confirm) return;

    try {
      setIsSubmittingQueue(true);
      const res = await api.post('/facebook/pages/branding/bulk-queue', {
        scope: 'selected',
        pageIds: targetPages.map(p => p.id),
        customAvatarPrompt,
        customCoverPrompt,
        customBioTemplate,
        customDescTemplate,
        autoApplyBioDesc,
        theme: selectedThemeId,
        autoApplyFacebook,
        brandingType: brandingTargetType,
      });

      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã đưa ${res.data.totalQueued} Fanpage vào hàng đợi Muse!`, 'success');
        setActiveTab(3); // Chuyển sang Tab Hàng Đợi để theo dõi
        await refreshData();
      } else {
        ztteam_showToast(res.data?.message || 'Không có Fanpage nào được thêm vào hàng đợi', 'info');
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi gửi vào hàng đợi', 'error');
    } finally {
      setIsSubmittingQueue(false);
    }
  };

  /** Cập nhật riêng Mô tả & Tiểu sử cho các Fanpage đã chọn qua Meta Graph API */
  const handleBulkApplyDescriptionsOnly = async () => {
    const targetPages = selectedPageIds.length > 0 
      ? pages.filter(p => selectedPageIds.includes(p.id))
      : filteredPages;

    if (targetPages.length === 0) {
      ztteam_showToast('Vui lòng chọn ít nhất 1 Fanpage để cập nhật mô tả', 'error');
      return;
    }

    if (!customBioTemplate.trim() && !customDescTemplate.trim()) {
      ztteam_showToast('Vui lòng nhập mẫu Tiểu sử (Bio) hoặc Mô tả (Description)', 'error');
      return;
    }

    const confirm = await ztteam_showConfirm(
      'Cập Nhật Mô Tả & Tiểu Sử Lên Facebook',
      `Bạn chuẩn bị gửi lệnh cập nhật Mô tả & Tiểu sử trực tiếp qua Meta Graph API cho ${targetPages.length} Fanpage.\n\n` +
      `- Chủ đề: ${THEME_PRESETS.find(t => t.id === selectedThemeId)?.name || selectedThemeId}\n` +
      `- Giữ nguyên toàn bộ Avatar và Ảnh bìa hiện tại.\n\n` +
      `Bạn có muốn tiếp tục áp dụng ngay?`
    );

    if (!confirm) return;

    try {
      setIsSubmittingBioOnly(true);
      const res = await api.post('/facebook/pages/branding/bulk-apply-descriptions', {
        pageIds: targetPages.map(p => p.id),
        bioTemplate: customBioTemplate,
        descTemplate: customDescTemplate,
        theme: selectedThemeId,
      });

      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã cập nhật Mô tả cho ${targetPages.length} Fanpage thành công!`, 'success');
        await refreshData();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi cập nhật mô tả lên Facebook', 'error');
    } finally {
      setIsSubmittingBioOnly(false);
    }
  };

  /** Áp dụng Ảnh lên Facebook thủ công */
  const handleApplySinglePageFacebook = async (page: any) => {
    const confirm = await ztteam_showConfirm(
      'Áp Dụng Lên Facebook',
      `Hệ thống sẽ cập nhật Avatar và Ảnh bìa đã tạo lên Fanpage "${page.name}". Quá trình này dùng cờ ẩn để không spam bảng tin. Bạn có muốn áp dụng?`
    );
    if (!confirm) return;

    try {
      setIsApplyingFacebook(page.id);
      const res = await api.post(`/facebook/pages/${page.id}/branding/apply`, {
        avatarUrl: page.brandingAvatarUrl || undefined,
        coverUrl: page.brandingCoverUrl || undefined,
      });
      if (res.data?.success) {
        ztteam_showToast(res.data.message || `Đã cập nhật Avatar & Ảnh bìa cho Fanpage "${page.name}" thành công!`, 'success');
        await refreshData();
      }
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message || 'Lỗi khi gắn lên Facebook', 'error');
    } finally {
      setIsApplyingFacebook(null);
    }
  };

  /** Reset hoặc Hủy bỏ Job */
  const handleResetJob = async (pageId: string) => {
    try {
      await api.post(`/facebook/pages/branding/${pageId}/reset`);
      ztteam_showToast('Đã đặt lại trạng thái nhận diện cho Page', 'success');
      await refreshData();
    } catch (err: any) {
      ztteam_showToast(err.message, 'error');
    }
  };

  /** Giải phóng các job bị kẹt (PROCESSING hoặc FAILED) quay về PENDING */
  const handleResetStuckJobs = async () => {
    try {
      const res = await api.post('/facebook/pages/branding/queue-reset', { resetAll: false });
      ztteam_showToast(res.data?.message || 'Đã giải phóng các job bị kẹt quay lại hàng đợi', 'success');
      await refreshData();
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message, 'error');
    }
  };

  /** Hủy bỏ toàn bộ hàng đợi Branding */
  const handleClearAllQueue = async () => {
    const confirm = await ztteam_showConfirm(
      'Hủy toàn bộ hàng đợi',
      'Bạn có chắc chắn muốn hủy và xóa toàn bộ Fanpage đang chờ vẽ khỏi hàng đợi?'
    );
    if (!confirm) return;

    try {
      const res = await api.post('/facebook/pages/branding/queue-reset', { resetAll: true });
      ztteam_showToast(res.data?.message || 'Đã làm sạch toàn bộ hàng đợi', 'success');
      await refreshData();
    } catch (err: any) {
      ztteam_showToast(err.response?.data?.message || err.message, 'error');
    }
  };

  /** Thống kê nhanh */
  const stats = useMemo(() => {
    const total = pages.filter(p => p.isActive !== false).length;
    const hasAvatar = pages.filter(p => p.isActive !== false && p.brandingAvatarUrl).length;
    const hasCover = pages.filter(p => p.isActive !== false && p.brandingCoverUrl).length;
    const missingAny = pages.filter(p => p.isActive !== false && (!p.brandingAvatarUrl || !p.brandingCoverUrl)).length;
    return { total, hasAvatar, hasCover, missingAny };
  }, [pages]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/** HEADER CHÍNH */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-fb-surface-hover/50">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <span className="material-symbols-outlined text-2xl">palette</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Tạo Ảnh Bìa & Avatar Theo Chủ Đề (Muse.ai)
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                MUSE RPA
              </span>
            </div>
            <p className="text-xs text-fb-text-muted mt-1">
              Hệ thống tự động hóa tạo nhận diện thương hiệu chuẩn điện ảnh theo từng Business Manager (BM), bám sát chủ đề Story và chèn tên Fanpage nghệ thuật.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="px-3 py-2 bg-fb-surface border border-fb-surface-hover/70 hover:bg-fb-surface-hover text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Tải lại dữ liệu"
          >
            <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`}>
              refresh
            </span>
            <span>{isRefreshing ? 'Đang tải...' : 'Làm mới'}</span>
          </button>

          <button
            onClick={() => navigate('/facebook')}
            className="px-4 py-2 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text font-bold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Quay lại Fanpage</span>
          </button>
        </div>
      </div>

      {/** THẺ KPI THỐNG KÊ NHẬN DIỆN */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-fb-surface p-4 rounded-2xl border border-fb-surface-hover/50 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-fb-text-muted uppercase tracking-wider flex items-center justify-between">
            <span>Tổng Fanpage</span>
            <span className="material-symbols-outlined text-base text-slate-400">flag</span>
          </div>
          <div className="text-2xl font-black text-white">{stats.total}</div>
          <div className="text-[11px] text-slate-400">Đang hoạt động trên hệ thống</div>
        </div>

        <div className="bg-fb-surface p-4 rounded-2xl border border-fb-surface-hover/50 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center justify-between">
            <span>Đã Có Avatar</span>
            <span className="material-symbols-outlined text-base text-emerald-400">account_circle</span>
          </div>
          <div className="text-2xl font-black text-emerald-400">{stats.hasAvatar}</div>
          <div className="text-[11px] text-slate-400">Avatar thương hiệu chuẩn 1:1</div>
        </div>

        <div className="bg-fb-surface p-4 rounded-2xl border border-fb-surface-hover/50 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-teal-400 uppercase tracking-wider flex items-center justify-between">
            <span>Đã Có Ảnh Bìa</span>
            <span className="material-symbols-outlined text-base text-teal-400">panorama</span>
          </div>
          <div className="text-2xl font-black text-teal-400">{stats.hasCover}</div>
          <div className="text-[11px] text-slate-400">Cover banner 16:9 sắc nét</div>
        </div>

        <div className="bg-fb-surface p-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 shadow-sm space-y-1">
          <div className="text-[11px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
            <span>Chưa Có Nhận Diện</span>
            <span className="material-symbols-outlined text-base text-amber-400">warning</span>
          </div>
          <div className="text-2xl font-black text-amber-400">{stats.missingAny}</div>
          <div className="text-[11px] text-amber-300/80 font-medium">Thiếu Avatar hoặc Ảnh bìa</div>
        </div>
      </div>

      {/** THANH CHUYỂN TABS CHUẨN (GIỐNG FACEBOOK PAGE SETTINGS) */}
      <div className="flex border-b border-fb-surface-hover/50 space-x-1 sm:space-x-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab(1)}
          className={`px-5 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 1
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-lg">checklist</span>
          <span>1. Chọn BM & Fanpage</span>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            activeTab === 1 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-fb-surface-hover text-slate-400 border-white/5'
          }`}>
            {filteredPages.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab(2)}
          className={`px-5 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 2
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-lg">tune</span>
          <span>2. Tùy Chỉnh Prompt & Chủ Đề</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 font-mono">
            {THEME_PRESETS.find(t => t.id === selectedThemeId)?.name.slice(0, 10)}...
          </span>
        </button>

        <button
          onClick={() => setActiveTab(3)}
          className={`px-5 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 3
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-lg">view_carousel</span>
          <span>3. Hàng Đợi & Xem Trước Ảnh</span>
          {queueStatus?.queue?.totalActiveJobs > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
              {queueStatus.queue.totalActiveJobs} Đang chạy
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab(4)}
          className={`px-5 py-3 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 rounded-t-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 4
              ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5 shadow-xs'
              : 'border-transparent text-fb-text-muted hover:text-fb-text hover:bg-fb-surface-hover/40'
          }`}
        >
          <span className="material-symbols-outlined text-lg">edit_note</span>
          <span>4. Mô Tả & Tiểu Sử (100% English)</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
            Native AI
          </span>
        </button>
      </div>

      {/** =========================================================================
       * TAB 1: CHỌN BM & BỘ LỌC FANPAGE
       * ========================================================================= */}
      {activeTab === 1 && (
        <div className="space-y-5 animate-in fade-in duration-200">
          {/** Khung Lọc: BM + Search + Tình trạng */}
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              {/** Chọn BM */}
              <div className="md:col-span-5 space-y-1.5">
                <label className="block text-xs font-bold text-fb-text flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-blue-400">corporate_fare</span>
                  <span>Chọn Business Manager (BM):</span>
                </label>
                <CustomDropdown
                  value={selectedBm}
                  onChange={val => setSelectedBm(val)}
                  options={[
                    { value: 'all', label: `🏢 Tất cả Doanh nghiệp (${stats.total} Page)` },
                    ...uniqueBusinesses.map(bm => ({
                      value: bm as string,
                      label: `🏢 ${bm} (${pages.filter(p => p.businessName === bm && p.isActive !== false).length} Page)`
                    }))
                  ]}
                  className="w-full"
                />
              </div>

              {/** Ô Tìm Kiếm */}
              <div className="md:col-span-4 space-y-1.5">
                <label className="block text-xs font-bold text-fb-text-muted flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">search</span>
                  <span>Tìm kiếm Fanpage:</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Nhập tên Fanpage hoặc ID..."
                    className="w-full px-3.5 py-2 pl-9 bg-fb-surface-hover/30 border border-fb-surface-hover/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
                  />
                  <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-sm">
                    search
                  </span>
                </div>
              </div>

              {/** Nút Thao Tác Nhanh */}
              <div className="md:col-span-3 flex items-center gap-2">
                <button
                  onClick={handleToggleSelectAll}
                  className="flex-1 py-2 px-3 bg-fb-surface-hover/50 hover:bg-fb-surface-hover border border-fb-surface-hover/70 text-slate-200 text-xs font-bold rounded-xl transition-all cursor-pointer text-center"
                >
                  {filteredPages.length > 0 && filteredPages.every(p => selectedPageIds.includes(p.id))
                    ? 'Bỏ chọn tất cả'
                    : `Chọn tất cả (${filteredPages.length})`}
                </button>
              </div>
            </div>

            {/** Bộ Lọc Trạng Thái Nhận Diện (Pill Buttons) */}
            <div className="pt-3 border-t border-fb-surface-hover/40 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-fb-text-muted mr-1">Bộ lọc nhanh:</span>

              <button
                type="button"
                onClick={() => setFilterMode('missing_only')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterMode === 'missing_only'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-xs'
                    : 'bg-fb-surface-hover/20 border-slate-700/60 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">warning</span>
                <span>Chưa có ảnh bìa hoặc avatar</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-amber-500/30 text-amber-200">
                  {stats.missingAny}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode('missing_cover')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterMode === 'missing_cover'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-xs'
                    : 'bg-fb-surface-hover/20 border-slate-700/60 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span>Chỉ thiếu Ảnh bìa</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                  {stats.total - stats.hasCover}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode('missing_avatar')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                  filterMode === 'missing_avatar'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-xs'
                    : 'bg-fb-surface-hover/20 border-slate-700/60 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span>Chỉ thiếu Avatar</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                  {stats.total - stats.hasAvatar}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  filterMode === 'all'
                    ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 shadow-xs'
                    : 'bg-fb-surface-hover/20 border-slate-700/60 text-slate-400 hover:border-slate-500'
                }`}
              >
                <span>Tất cả Fanpage ({stats.total})</span>
              </button>
            </div>
          </div>

          {/** Bảng Danh Sách Fanpage */}
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 overflow-hidden">
            <div className="p-3.5 bg-slate-800/60 border-b border-fb-surface-hover/60 flex items-center justify-between text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={filteredPages.length > 0 && filteredPages.every(p => selectedPageIds.includes(p.id))}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
                />
                <span className="font-bold">Danh sách Fanpage ({filteredPages.length} Page phù hợp)</span>
              </div>
              <div className="text-emerald-400 font-mono font-bold text-xs">
                Đã chọn: {selectedPageIds.length} Page
              </div>
            </div>

            <div className="divide-y divide-fb-surface-hover/40 max-h-[550px] overflow-y-auto">
              {filteredPages.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs space-y-1">
                  <span className="material-symbols-outlined text-3xl text-slate-500">filter_none</span>
                  <div>Không tìm thấy Fanpage nào phù hợp với bộ lọc hiện tại.</div>
                </div>
              ) : (
                filteredPages.map(page => {
                  const isSelected = selectedPageIds.includes(page.id);
                  const hasAvatar = !!page.brandingAvatarUrl;
                  const hasCover = !!page.brandingCoverUrl;

                  return (
                    <div
                      key={page.id}
                      onClick={() => handleToggleSelectPage(page.id)}
                      className={`p-3.5 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-500/10 hover:bg-emerald-500/15' : 'hover:bg-fb-surface-hover/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectPage(page.id)}
                          onClick={e => e.stopPropagation()}
                          className="w-4 h-4 rounded text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer shrink-0"
                        />

                        {/** Avatar Thumbnail */}
                        <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-slate-800 border border-slate-700/60 shrink-0">
                          {page.avatar ? (
                            <img src={page.avatar} alt={page.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold text-xs">
                              {page.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          {hasAvatar && (
                            <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-900" title="Đã có Avatar tùy chỉnh" />
                          )}
                        </div>

                        {/** Thông tin Page */}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-white text-xs sm:text-sm truncate flex items-center gap-2">
                            <span>{page.name}</span>
                            {page.businessName && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-normal shrink-0">
                                {page.businessName}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                            <span className="font-mono">ID: {page.fb_page_id || page.id}</span>
                            <span>•</span>
                            <span className="text-emerald-400/90">{page.primarySourceWeb || window.location.hostname || 't7.goxo.us'}</span>
                          </div>
                        </div>
                      </div>

                      {/** Cột Trạng Thái Nhận Diện */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        {/** Trạng thái Avatar */}
                        {hasAvatar ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            Avatar 1:1
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="material-symbols-outlined text-[12px]">hide_image</span>
                            Thiếu Avatar
                          </span>
                        )}

                        {/** Trạng thái Cover */}
                        {hasCover ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-500/15 text-teal-400 border border-teal-500/30">
                            <span className="material-symbols-outlined text-[12px]">check_circle</span>
                            Ảnh bìa 16:9
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <span className="material-symbols-outlined text-[12px]">panorama</span>
                            Thiếu Cover
                          </span>
                        )}

                        {/** Nút Chuyển nhanh qua tab cấu hình */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPageIds([page.id]);
                            setActiveTab(2);
                          }}
                          className="p-1.5 hover:bg-fb-surface-hover rounded-lg text-slate-400 hover:text-white transition-colors"
                          title="Cấu hình Prompt cho Page này"
                        >
                          <span className="material-symbols-outlined text-sm">edit_note</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/** Footer Bảng */}
            <div className="p-3 bg-slate-900/40 border-t border-fb-surface-hover/50 flex items-center justify-between">
              <div className="text-xs text-slate-400">
                Hiển thị <b className="text-white">{filteredPages.length}</b> Fanpage
              </div>
              <button
                type="button"
                onClick={() => setActiveTab(2)}
                className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <span>Tiếp tục sang bước 2: Tùy chỉnh Prompt</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/** =========================================================================
       * TAB 2: STUDIO TÙY CHỈNH PROMPT & CHỦ ĐỀ
       * ========================================================================= */}
      {activeTab === 2 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/** Cột Trái: Chọn Preset & Tùy chỉnh Prompt */}
            <div className="lg:col-span-8 space-y-5">
              {/** Khối 1: Chọn Preset Chủ đề */}
              <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-5 space-y-3">
                <label className="block text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">style</span>
                  <span>1. Chọn Phong Cách & Chủ Đề Mẫu</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {THEME_PRESETS.map(preset => {
                    const isSelected = selectedThemeId === preset.id;
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleSelectThemePreset(preset.id)}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          isSelected
                            ? 'bg-emerald-500/15 border-emerald-500 text-white font-bold shadow-md shadow-emerald-500/10'
                            : 'bg-fb-surface-hover/20 border-slate-700/60 text-slate-400 hover:border-slate-500'
                        }`}
                      >
                        <div className="text-xs font-bold text-white flex items-center justify-between">
                          <span>{preset.name}</span>
                          {isSelected && <span className="material-symbols-outlined text-sm text-emerald-400">check</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {preset.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/** Khối 2: Prompt Avatar 1:1 */}
              <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">account_circle</span>
                    <span>2. Prompt Ảnh Đại Diện (Avatar 1:1)</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">Vuông 1024x1024</span>
                </div>
                <textarea
                  rows={4}
                  value={customAvatarPrompt}
                  onChange={e => setCustomAvatarPrompt(e.target.value)}
                  placeholder="Nhập câu lệnh prompt tiếng Anh cho Avatar..."
                  className="w-full p-3.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed"
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Biến mẫu:</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono">
                    {'{PAGE_NAME}'}
                  </span>
                  <span>= Tên Fanpage;</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-400 font-mono">
                    {'{THEME}'}
                  </span>
                  <span>= Chủ đề</span>
                </div>
              </div>

              {/** Khối 3: Prompt Cover 16:9 */}
              <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-teal-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-base">panorama</span>
                    <span>3. Prompt Ảnh Bìa Fanpage (Cover 16:9)</span>
                  </label>
                  <span className="text-[11px] font-mono text-slate-400">Cinematic Banner 16:9</span>
                </div>
                <textarea
                  rows={4}
                  value={customCoverPrompt}
                  onChange={e => setCustomCoverPrompt(e.target.value)}
                  placeholder="Nhập câu lệnh prompt tiếng Anh cho Ảnh bìa..."
                  className="w-full p-3.5 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-teal-500 font-mono leading-relaxed"
                />
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                  <span>Biến mẫu:</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-400 font-mono">
                    {'{PAGE_NAME}'}
                  </span>
                  <span>= Tên Fanpage;</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-400 font-mono">
                    {'{THEME}'}
                  </span>
                  <span>= Chủ đề</span>
                </div>
              </div>

              {/** Khối 4: Tiểu Sử & Mô Tả Fanpage (Bio / Description) */}
              <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-5 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-fb-surface-hover/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-cyan-400">badge</span>
                    <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
                      4. Tiểu Sử & Mô Tả Fanpage Theo Chủ Đề (Bio / About)
                    </label>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono">
                    META GRAPH API
                  </span>
                </div>

                <div className="space-y-3">
                  {/** Ô nhập Bio ngắn */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1">
                        <span>Tiểu sử ngắn (Bio Mobile):</span>
                      </label>
                      <span className="text-[10px] text-slate-400">Hiển thị dưới Tên Page (khuyến nghị dưới 100 ký tự)</span>
                    </div>
                    <input
                      type="text"
                      value={customBioTemplate}
                      onChange={e => setCustomBioTemplate(e.target.value)}
                      placeholder="{PAGE_NAME} — Lắng nghe những câu chuyện đời thường..."
                      className="w-full p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>

                  {/** Ô nhập Mô tả chi tiết */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-white flex items-center gap-1">
                        <span>Mô tả chi tiết (About / Description):</span>
                      </label>
                      <span className="text-[10px] text-slate-400">Giới thiệu sứ mệnh & nội dung của Fanpage</span>
                    </div>
                    <textarea
                      rows={3}
                      value={customDescTemplate}
                      onChange={e => setCustomDescTemplate(e.target.value)}
                      placeholder="Chào mừng bạn đến với {PAGE_NAME}. Nơi chia sẻ những câu chuyện nhân văn..."
                      className="w-full p-3 bg-slate-900/60 border border-slate-700/60 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 leading-relaxed"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                    <span>Biến tự động điền:</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400 font-mono">
                      {'{PAGE_NAME}'}
                    </span>
                    <span>= Tên Page;</span>
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-teal-400 font-mono">
                      {'{THEME}'}
                    </span>
                    <span>= Chủ đề</span>
                  </div>
                </div>
              </div>
            </div>

            {/** Cột Phải: Cấu hình Thực thi & Nút Hành Động */}
            <div className="lg:col-span-4 space-y-5">
              <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-5 space-y-4">
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-fb-surface-hover/40">
                  <span className="material-symbols-outlined text-base text-emerald-400">tune</span>
                  <span>Tùy Chọn Thực Thi</span>
                </h3>

                {/** Loại hình ảnh muốn tạo */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-fb-text">Loại ảnh cần Muse tạo:</label>
                  <CustomDropdown
                    value={brandingTargetType}
                    onChange={val => setBrandingTargetType(val as any)}
                    options={[
                      { value: 'both', label: 'Cả Avatar (1:1) & Ảnh Bìa (16:9)' },
                      { value: 'avatar', label: 'Chỉ tạo Avatar (1:1)' },
                      { value: 'cover', label: 'Chỉ tạo Ảnh Bìa (16:9)' },
                    ]}
                  />
                </div>

                {/** Switch 1: Tự động cập nhật lên Facebook */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="space-y-0.5 pr-2">
                    <div className="text-xs font-bold text-white">Tự động gắn lên Facebook</div>
                    <div className="text-[10px] text-slate-400">Gắn ảnh ngay sau khi Muse render xong qua Meta API (cờ ẩn).</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAutoApplyFacebook(!autoApplyFacebook)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 cursor-pointer ${
                      autoApplyFacebook ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoApplyFacebook ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/** Switch 2: Chèn tên Fanpage vào Artwork */}
                <div className="pt-2 flex items-center justify-between">
                  <div className="space-y-0.5 pr-2">
                    <div className="text-xs font-bold text-white">Chèn Tên Page Typography</div>
                    <div className="text-[10px] text-slate-400">Yêu cầu Muse vẽ tên Fanpage dạng chữ nổi bật vào ảnh.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIncludePageNameText(!includePageNameText)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors shrink-0 cursor-pointer ${
                      includePageNameText ? 'bg-emerald-500' : 'bg-black/30 shadow-inner border border-white/5'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${includePageNameText ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/** Tóm tắt phạm vi */}
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1.5 text-xs text-emerald-300">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    <span>Phạm vi áp dụng:</span>
                  </div>
                  <div>
                    {selectedPageIds.length > 0
                      ? `Đang chọn ${selectedPageIds.length} Fanpage cụ thể.`
                      : `Áp dụng cho toàn bộ ${filteredPages.length} Fanpage theo bộ lọc hiện tại.`}
                  </div>
                </div>

                {/** Nút Bắt Đầu Gửi Hàng Đợi */}
                <button
                  type="button"
                  onClick={handleQueueBrandingSubmit}
                  disabled={isSubmittingQueue || (selectedPageIds.length === 0 && filteredPages.length === 0)}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingQueue ? (
                    <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-sm">rocket_launch</span>
                  )}
                  <span>
                    {isSubmittingQueue
                      ? 'Đang gửi vào hàng đợi...'
                      : `Đưa ${selectedPageIds.length > 0 ? selectedPageIds.length : filteredPages.length} Page Vào Hàng Đợi Muse`}
                  </span>
                </button>

                {/** Nút Cập nhật riêng Mô tả & Tiểu sử trực tiếp qua Meta API */}
                <div className="pt-2 border-t border-fb-surface-hover/40 space-y-2">
                  <div className="text-[11px] text-slate-400">
                    Cập nhật nhanh Tiểu sử & Mô tả cho các Page đã có sẵn Avatar/Cover:
                  </div>
                  <button
                    type="button"
                    onClick={handleBulkApplyDescriptionsOnly}
                    disabled={isSubmittingBioOnly || (selectedPageIds.length === 0 && filteredPages.length === 0)}
                    className="w-full py-2.5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isSubmittingBioOnly ? (
                      <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">send</span>
                    )}
                    <span>
                      {isSubmittingBioOnly
                        ? 'Đang cập nhật lên Facebook...'
                        : `Cập Nhật Riêng Mô Tả & Bio (${selectedPageIds.length > 0 ? selectedPageIds.length : filteredPages.length} Page)`}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/** =========================================================================
       * TAB 3: HÀNG ĐỢI & THƯ VIỆN ẢNH ĐÃ TẠO (LIVE STATUS & MOCKUP)
       * ========================================================================= */}
      {activeTab === 3 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/** Khung Trạng Thái Worker & Hàng Đợi */}
          <div className="bg-fb-surface rounded-2xl shadow-lg border border-fb-surface-hover/50 p-4 sm:p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fb-surface-hover/40">
              <div className="flex items-center gap-2.5">
                <span className={`p-2 rounded-xl border ${
                  queueStatus?.worker?.online
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                }`}>
                  <span className="material-symbols-outlined text-lg">smart_toy</span>
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white">Trạng Thái Muse Worker (Chrome RPA)</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Worker chạy trên máy tính kết nối cổng Chrome Remote Debugging 9245.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {queueStatus?.worker?.online ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>🟢 Worker Trực Tuyến ({queueStatus.worker.workerName || 'Port 9245'})</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30 font-mono">
                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                    <span>🔴 Worker Chưa Kết Nối (Offline)</span>
                  </span>
                )}
              </div>
            </div>

            {/** Hướng dẫn kích hoạt Worker khi Offline */}
            {!queueStatus?.worker?.online && (
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <span className="material-symbols-outlined text-sm">info</span>
                  <span>Hướng dẫn kích hoạt Muse Worker để vẽ ảnh Fanpage:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5 space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1">
                      <span>Bước 1: Mở Chrome Debugging</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Chạy file <code className="text-white bg-slate-800 px-1 py-0.5 rounded font-mono">start_chrome_branding_muse.bat</code> và đăng nhập tài khoản Muse.ai trên trình duyệt vừa mở.
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-950/60 border border-white/5 space-y-1">
                    <div className="font-bold text-teal-400 flex items-center gap-1">
                      <span>Bước 2: Bật Worker Vẽ Ảnh</span>
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Chạy file <code className="text-white bg-slate-800 px-1 py-0.5 rounded font-mono">start_muse_branding_worker.bat</code>, worker sẽ tự động kết nối và vẽ tuần tự các page trong hàng đợi.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/** Thống kê chi tiết Queue */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Chờ xử lý (Pending)</div>
                <div className="text-xl font-bold text-amber-400 mt-0.5">
                  {queueStatus?.queue?.pending || 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Đang vẽ (Processing)</div>
                <div className="text-xl font-bold text-cyan-400 mt-0.5">
                  {queueStatus?.queue?.processing || 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Đã hoàn thành</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">
                  {queueStatus?.queue?.completed || 0}
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-700/60 text-center">
                <div className="text-[10px] text-slate-400 font-bold uppercase">Lỗi (Failed)</div>
                <div className="text-xl font-bold text-rose-400 mt-0.5">
                  {queueStatus?.queue?.failed || 0}
                </div>
              </div>
            </div>

            {/** Thanh Nút Điều Khiển Hàng Đợi */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-fb-surface-hover/30">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-slate-500">sync_saved_locally</span>
                <span>Tự động cập nhật mỗi 10 giây</span>
              </div>

              <div className="flex items-center gap-2">
                {((queueStatus?.queue?.processing || 0) > 0 || (queueStatus?.queue?.failed || 0) > 0) && (
                  <button
                    type="button"
                    onClick={handleResetStuckJobs}
                    className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Đưa các Page đang bị kẹt hoặc lỗi quay lại danh sách chờ"
                  >
                    <span className="material-symbols-outlined text-sm">lock_open</span>
                    <span>Giải phóng Job kẹt ({((queueStatus?.queue?.processing || 0) + (queueStatus?.queue?.failed || 0))} Page)</span>
                  </button>
                )}

                {(queueStatus?.queue?.totalActiveJobs || 0) > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllQueue}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-950/40 border border-slate-700 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Xóa toàn bộ Fanpage đang chờ vẽ khỏi hàng đợi"
                  >
                    <span className="material-symbols-outlined text-sm">delete_sweep</span>
                    <span>Hủy hàng đợi</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={refreshData}
                  disabled={isRefreshing}
                  className="px-3 py-1.5 rounded-xl bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`}>
                    refresh
                  </span>
                  <span>Làm mới</span>
                </button>
              </div>
            </div>
          </div>

          {/** Lưới Xem Trước Mockup Fanpage Facebook Chuẩn Thực Tế */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400">preview</span>
                <span>Thư Viện Nhận Diện Fanpage (Mockup Facebook Chuẩn)</span>
              </h3>
              <div className="text-xs text-slate-400">
                Hiển thị các Fanpage trong hệ thống kèm Avatar 1:1 và Cover 16:9
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {pages.map(page => {
                const hasAvatar = !!page.brandingAvatarUrl;
                const hasCover = !!page.brandingCoverUrl;
                const isApplying = isApplyingFacebook === page.id;

                return (
                  <div
                    key={page.id}
                    className="bg-fb-surface rounded-2xl border border-fb-surface-hover/60 overflow-hidden shadow-lg flex flex-col justify-between transition-all hover:border-slate-600"
                  >
                    <div>
                      {/** Khung Mockup Cover Banner 16:9 */}
                      <div className="relative aspect-video bg-slate-900 overflow-hidden border-b border-fb-surface-hover/40">
                        {page.brandingCoverUrl ? (
                          <img
                            src={page.brandingCoverUrl}
                            alt="Cover"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 text-xs p-4 text-center">
                            <span className="material-symbols-outlined text-3xl mb-1 text-slate-600">panorama</span>
                            <span>Chưa có ảnh bìa tùy chỉnh</span>
                            <span className="text-[10px] text-slate-600 mt-0.5">Sẵn sàng để Muse vẽ</span>
                          </div>
                        )}

                        {/** Badge BM nổi góc phải */}
                        {page.businessName && (
                          <span className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-slate-950/80 backdrop-blur-md text-slate-300 text-[10px] font-bold border border-white/10">
                            {page.businessName}
                          </span>
                        )}

                        {/** Avatar 1:1 đè góc dưới trái */}
                        <div className="absolute -bottom-4 left-4 w-14 h-14 rounded-full border-3 border-fb-surface overflow-hidden bg-slate-800 shadow-xl">
                          {page.brandingAvatarUrl || page.avatar ? (
                            <img
                              src={page.brandingAvatarUrl || page.avatar}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold text-sm">
                              {page.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                      </div>

                      {/** Thông tin Fanpage bên dưới */}
                      <div className="pt-6 p-4 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-white text-sm truncate" title={page.name}>
                            {page.name}
                          </h4>
                          {page.brandingStatus === 'PENDING' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 shrink-0">
                              Chờ Muse vẽ
                            </span>
                          )}
                          {page.brandingStatus === 'PROCESSING' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shrink-0 animate-pulse">
                              Đang vẽ...
                            </span>
                          )}
                          {page.brandingStatus === 'COMPLETED' && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shrink-0">
                              Đã hoàn thành
                            </span>
                          )}
                        </div>

                        {/** Dòng Bio xem trước theo chuẩn Facebook */}
                        {page.brandingBio ? (
                          <p className="text-[11px] text-slate-300 italic line-clamp-2 bg-slate-900/50 p-2 rounded-lg border border-slate-700/40">
                            "{page.brandingBio}"
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">
                            Chưa cài đặt tiểu sử theo chủ đề
                          </p>
                        )}

                        <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1">
                          <span className="font-mono">ID: {page.fb_page_id || page.id}</span>
                          <span className="text-emerald-400/90 font-medium">{page.primarySourceWeb || window.location.hostname || 't7.goxo.us'}</span>
                        </div>
                      </div>
                    </div>

                    {/** Thanh Thao Tác Dưới Cùng */}
                    <div className="p-3 bg-slate-900/30 border-t border-fb-surface-hover/40 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {page.brandingCoverUrl && (
                          <a
                            href={page.brandingCoverUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 hover:bg-fb-surface-hover rounded-lg text-slate-400 hover:text-white transition-colors"
                            title="Xem Ảnh Bìa gốc"
                          >
                            <span className="material-symbols-outlined text-sm">open_in_new</span>
                          </a>
                        )}
                        {page.brandingStatus && page.brandingStatus !== 'NONE' && (
                          <button
                            type="button"
                            onClick={() => handleResetJob(page.id)}
                            className="p-1.5 hover:bg-fb-surface-hover rounded-lg text-slate-400 hover:text-rose-400 transition-colors"
                            title="Reset trạng thái job"
                          >
                            <span className="material-symbols-outlined text-sm">restart_alt</span>
                          </button>
                        )}
                      </div>

                      {(hasAvatar || hasCover) ? (
                        <button
                          type="button"
                          onClick={() => handleApplySinglePageFacebook(page)}
                          disabled={isApplying}
                          className="px-3 py-1.5 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-xl flex items-center gap-1 transition-all cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">
                            {isApplying ? 'sync' : 'publish'}
                          </span>
                          <span>{isApplying ? 'Đang gắn...' : 'Gắn lên Facebook'}</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPageIds([page.id]);
                            setActiveTab(2);
                          }}
                          className="px-3 py-1.5 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          Tạo ảnh cho Page này
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/** =========================================================================
       * TAB 4: QUẢN LÝ MÔ TẢ & TIỂU SỬ THEO CHỦ ĐỀ (100% NATIVE ENGLISH)
       * ========================================================================= */}
      {activeTab === 4 && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/** Header Banner Tác Vụ */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-fb-surface to-teal-950/40 p-5 rounded-2xl border border-emerald-500/30 shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="material-symbols-outlined text-lg">edit_note</span>
                </span>
                <h3 className="text-base font-bold text-white tracking-wide">
                  Tác Vụ Riêng Biệt: Quản Lý Mô Tả & Tiểu Sử (100% Native English)
                </h3>
              </div>
              <p className="text-xs text-slate-300">
                Cập nhật Tiểu sử (Bio $\le$ 100 ký tự) & Giới thiệu (About/Description) chuẩn văn phong tiếng Anh quốc tế qua Meta Graph API trong 3–5 giây. Độc lập hoàn toàn với tiến trình tạo ảnh của Muse.ai.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-slate-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Đã chọn: <strong className="text-emerald-400">{selectedPageIds.length > 0 ? selectedPageIds.length : filteredPages.length}</strong> Page</span>
              </div>
            </div>
          </div>

          {/** Bố cục chính 2 Cột: Cấu hình Soạn Thảo (Trái) & Danh sách + Live Mockup (Phải) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/** ================== CỘT TRÁI (5 CỘT): CẤU HÌNH & SOẠN THẢO ================== */}
            <div className="lg:col-span-5 space-y-5">
              {/** Card 1: Chọn Chủ Đề */}
              <div className="bg-fb-surface rounded-2xl border border-fb-surface-hover/50 p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-lg">category</span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">1. Chủ Đề Kênh (Theme)</h4>
                  </div>
                  <span className="text-[11px] text-emerald-400 font-mono">100% English</span>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">Chọn Preset Theo Chủ Đề:</label>
                  <CustomDropdown
                    value={bioThemeId}
                    onChange={handleSelectBioThemePreset}
                    options={THEME_PRESETS.map(t => ({
                      value: t.id,
                      label: t.name,
                    }))}
                  />
                  <p className="text-[11px] text-slate-400 pt-1">
                    {THEME_PRESETS.find(t => t.id === bioThemeId)?.desc}
                  </p>
                </div>
              </div>

              {/** Card 2: Preset Chuẩn Tiếng Anh & Chỉnh Sửa Mẫu */}
              <div className="bg-fb-surface rounded-2xl border border-fb-surface-hover/50 p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-fb-surface-hover/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-cyan-400 text-lg">description</span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">2. Mẫu Tiếng Anh Chuẩn (Preset)</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyPresetToSelectedPages}
                    className="px-2.5 py-1 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xs">playlist_add_check</span>
                    <span>Áp Dụng Cho Danh Sách</span>
                  </button>
                </div>

                {/** Ô nhập Bio Tiếng Anh */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>Tiểu Sử / Bio (Ngắn gọn)</span>
                      <span className="text-[10px] text-slate-400">(Hiển thị dưới tên Page)</span>
                    </label>
                    <span className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                      editingBio.length > 101
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    }`}>
                      {editingBio.length}/101 ký tự
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={editingBio}
                    onChange={(e) => setEditingBio(e.target.value)}
                    placeholder="e.g. {PAGE_NAME} — Heartfelt stories, quiet moments, and the human spirit."
                    className="w-full bg-black/40 border border-fb-surface-hover/80 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors font-sans"
                  />
                  <div className="flex items-center justify-between text-[10px] text-slate-400">
                    <span>Hỗ trợ biến: <code className="text-emerald-400">{'{PAGE_NAME}'}</code></span>
                    {editingBio.length > 101 && (
                      <span className="text-rose-400 font-bold">Cảnh báo: Facebook chỉ cho phép tối đa 101 ký tự cho Bio</span>
                    )}
                  </div>
                </div>

                {/** Ô nhập Mô tả Chi tiết Tiếng Anh */}
                <div className="space-y-1.5 pt-2 border-t border-fb-surface-hover/30">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span>Mô Tả Chi Tiết / About</span>
                      <span className="text-[10px] text-slate-400">(Mục Giới thiệu Fanpage)</span>
                    </label>
                    <span className="text-[11px] font-mono text-slate-400">
                      {editingDesc.length} ký tự
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={editingDesc}
                    onChange={(e) => setEditingDesc(e.target.value)}
                    placeholder="e.g. Welcome to {PAGE_NAME}. We chronicle everyday human journeys..."
                    className="w-full bg-black/40 border border-fb-surface-hover/80 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition-colors font-sans leading-relaxed"
                  />
                  <div className="text-[10px] text-slate-400">
                    Mô tả súc tích từ 150–250 ký tự sẽ tối ưu hóa khả năng hiển thị trên Facebook Mobile và SEO Meta Search.
                  </div>
                </div>
              </div>

              {/** Card 3: AI Smart Generator (100% Native English) */}
              <div className="bg-fb-surface rounded-2xl border border-teal-500/30 bg-teal-500/5 p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-teal-500/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-400 text-lg">auto_awesome</span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">3. Sinh Độc Bản Bằng AI (Smart Writer)</h4>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-teal-500/20 text-teal-300 font-mono border border-teal-500/30">
                    OpenAI / Gemini
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Tone Văn Phong Tiếng Anh:</label>
                    <select
                      value={bioTone}
                      onChange={(e) => setBioTone(e.target.value)}
                      className="w-full bg-black/40 border border-fb-surface-hover/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-teal-500"
                    >
                      <option value="Emotive, heartfelt and authentic">Warm & Emotive (Cảm xúc & Nhân văn)</option>
                      <option value="Dramatic, suspenseful and intense">Dramatic & Intense (Kịch tính & Ly kỳ)</option>
                      <option value="Inspiring, uplifting and motivational">Inspiring & Resilient (Truyền cảm hứng & Vươn lên)</option>
                      <option value="Historical, enigmatic and archival">Historical & Relic (Cổ tích & Huyền sử)</option>
                      <option value="Investigative, noir and mysterious">Investigative Mystery (Trinh thám & Vụ án)</option>
                      <option value="Modern, journalistic and insightful">Modern Editorial (Hiện đại & Khám phá)</option>
                    </select>
                  </div>

                  <p className="text-[11px] text-slate-400">
                    AI sẽ phân tích từng tên Fanpage và chủ đề để tự động viết Bio độc bản $le$ 100 ký tự và đoạn Description hấp dẫn, không bị trùng lặp.
                  </p>

                  <button
                    type="button"
                    onClick={handleAIGenerateDescriptions}
                    disabled={isGeneratingBioAI || (selectedPageIds.length === 0 && filteredPages.length === 0)}
                    className="w-full py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:opacity-90 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-teal-500/20 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingBioAI ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        <span>Đang gọi AI sáng tạo nội dung...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">magic_button</span>
                        <span>Sinh Bằng AI Cho {selectedPageIds.length > 0 ? selectedPageIds.length : filteredPages.length} Page</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/** Nút Thao Tác Chính: Đẩy Lên Facebook Qua Graph API */}
              <div className="bg-fb-surface rounded-2xl border border-emerald-500/30 p-4 space-y-3 shadow-lg">
                <div className="flex items-center gap-2 text-xs text-emerald-400 font-bold">
                  <span className="material-symbols-outlined text-base">cloud_upload</span>
                  <span>Đồng bộ Meta Graph API</span>
                </div>
                <button
                  type="button"
                  onClick={handleBulkSyncDescriptionsToFacebook}
                  disabled={isApplyingBioToFb || (selectedPageIds.length === 0 && filteredPages.length === 0)}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50"
                >
                  {isApplyingBioToFb ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-base">sync</span>
                      <span>Đang cập nhật lên Facebook...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">rocket_launch</span>
                      <span>Đẩy Mô Tả Lên Facebook ({selectedPageIds.length > 0 ? selectedPageIds.length : filteredPages.length} Page)</span>
                    </>
                  )}
                </button>
                <div className="text-[11px] text-center text-slate-400">
                  ⚡ Cập nhật đồng loạt các trường <code className="text-slate-300">bio</code>, <code className="text-slate-300">about</code> và <code className="text-slate-300">description</code> tức thì.
                </div>
              </div>
            </div>

            {/** ================== CỘT PHẢI (7 CỘT): LIVE MOCKUP & DANH SÁCH ================== */}
            <div className="lg:col-span-7 space-y-5">
              {/** Khung Xem Trước Mockup Facebook Header Trực Quan */}
              <div className="bg-fb-surface rounded-2xl border border-fb-surface-hover/50 overflow-hidden shadow-lg">
                <div className="p-3 bg-black/40 border-b border-fb-surface-hover/40 flex items-center justify-between text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-sm">visibility</span>
                    <span className="font-bold text-white">Live Mockup: Giao Diện Fanpage Thực Tế</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {previewPageForBio ? previewPageForBio.name : (filteredPages[0]?.name || 'Preview')}
                  </span>
                </div>

                {/** Thẻ Mockup Facebook Profile Header */}
                {(() => {
                  const targetPage = previewPageForBio || filteredPages[0] || pages[0];
                  if (!targetPage) return <div className="p-6 text-center text-xs text-slate-500">Chưa có dữ liệu Fanpage</div>;

                  const customData = pageDescriptionsMap[targetPage.id];
                  const displayedBio = customData?.bio !== undefined
                    ? customData.bio
                    : (targetPage.brandingBio || editingBio.replace(/\{PAGE_NAME\}/g, targetPage.name).slice(0, 101));
                  const displayedDesc = customData?.description !== undefined
                    ? customData.description
                    : (targetPage.brandingDescription || editingDesc.replace(/\{PAGE_NAME\}/g, targetPage.name));

                  return (
                    <div className="bg-slate-950 p-4 space-y-4">
                      {/** Cover Banner */}
                      <div className="relative h-36 sm:h-44 rounded-xl overflow-hidden bg-slate-900 border border-white/5 flex items-center justify-center">
                        {targetPage.brandingCoverUrl ? (
                          <img
                            src={targetPage.brandingCoverUrl}
                            alt="Cover"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-center p-4 space-y-1">
                            <span className="material-symbols-outlined text-3xl text-slate-700">panorama</span>
                            <div className="text-[11px] text-slate-500">Ảnh bìa 16:9 ({targetPage.primarySourceWeb || 't7.goxo.us'})</div>
                          </div>
                        )}
                        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-[10px] text-emerald-400 font-mono border border-emerald-500/30">
                          {THEME_PRESETS.find(t => t.id === bioThemeId)?.name.split(' ')[1] || 'Theme'}
                        </div>
                      </div>

                      {/** Avatar + Header Information */}
                      <div className="px-2 -mt-12 sm:-mt-14 flex flex-col sm:flex-row items-center sm:items-end gap-3 sm:gap-4 relative z-10">
                        <div className="h-20 w-20 sm:h-24 sm:w-24 rounded-full border-4 border-slate-950 bg-slate-800 overflow-hidden shrink-0 shadow-xl flex items-center justify-center">
                          {targetPage.brandingAvatarUrl ? (
                            <img
                              src={targetPage.brandingAvatarUrl}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="material-symbols-outlined text-3xl text-slate-500">account_circle</span>
                          )}
                        </div>

                        <div className="text-center sm:text-left flex-1 min-w-0 pb-1">
                          <div className="flex items-center justify-center sm:justify-start gap-1.5">
                            <h2 className="text-base sm:text-lg font-black text-white truncate">{targetPage.name}</h2>
                            <span className="material-symbols-outlined text-blue-400 text-sm" title="Verified Page">verified</span>
                          </div>
                          <div className="text-xs text-slate-400 flex items-center justify-center sm:justify-start gap-2 mt-0.5">
                            <span>{targetPage.category || 'Story & Entertainment'}</span>
                            <span>•</span>
                            <span className="text-slate-300 font-medium">{(targetPage.followersCount || targetPage.follower_count || 1250).toLocaleString()} followers</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 pb-1">
                          <span className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1 shadow-sm">
                            <span className="material-symbols-outlined text-sm">person_add</span>
                            <span>Follow</span>
                          </span>
                          <span className="px-3 py-1.5 rounded-xl bg-slate-800 border border-white/10 text-slate-300 font-bold text-xs">
                            Message
                          </span>
                        </div>
                      </div>

                      {/** BIO & DESCRIPTION CONTAINER TRONG MOCKUP */}
                      <div className="mt-3 p-3.5 bg-black/40 border border-white/5 rounded-xl space-y-2.5">
                        {/** Bio */}
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">badge</span>
                            <span>Page Bio (Dưới 101 ký tự)</span>
                          </div>
                          <div className="text-xs text-white italic font-serif mt-1 pl-2 border-l-2 border-emerald-500">
                            "{displayedBio || 'Chưa thiết lập Bio'}"
                          </div>
                        </div>

                        {/** Description / About */}
                        <div className="pt-2 border-t border-white/5">
                          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">info</span>
                            <span>About / Giới thiệu chi tiết</span>
                          </div>
                          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                            {displayedDesc || 'Chưa thiết lập Mô tả'}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/** Bảng Danh Sách Fanpage & Bộ Lọc Nhanh */}
              <div className="bg-fb-surface rounded-2xl border border-fb-surface-hover/50 p-4 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-fb-surface-hover/40">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400 text-lg">format_list_bulleted</span>
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                      Danh Sách Fanpage ({filteredPages.length})
                    </h4>
                  </div>

                  {/** Bộ lọc tìm kiếm & Lọc trạng thái bio */}
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <input
                      type="text"
                      value={bioSearchQuery}
                      onChange={(e) => setBioSearchQuery(e.target.value)}
                      placeholder="Tìm tên trang / ID..."
                      className="px-3 py-1.5 bg-black/40 border border-fb-surface-hover rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-36 sm:w-44"
                    />

                    <select
                      value={bioFilterStatus}
                      onChange={(e: any) => setBioFilterStatus(e.target.value)}
                      className="px-2.5 py-1.5 bg-black/40 border border-fb-surface-hover rounded-xl text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="all">Tất cả trang</option>
                      <option value="missing">Chưa có Bio</option>
                      <option value="has_bio">Đã có Bio</option>
                    </select>

                    <button
                      type="button"
                      onClick={handleToggleSelectAll}
                      className="px-2.5 py-1.5 bg-fb-surface-hover hover:bg-fb-surface-hover/80 text-fb-text text-xs font-bold rounded-xl whitespace-nowrap cursor-pointer transition-colors"
                    >
                      {filteredPages.every(p => selectedPageIds.includes(p.id)) ? 'Bỏ chọn hết' : 'Chọn tất cả'}
                    </button>
                  </div>
                </div>

                {/** Danh sách từng Fanpage với ô nhập Bio/Desc trực tiếp */}
                <div className="space-y-3 max-h-[550px] overflow-y-auto pr-1">
                  {filteredPages
                    .filter(p => {
                      if (bioSearchQuery.trim()) {
                        const q = bioSearchQuery.toLowerCase();
                        const matchName = (p.name || '').toLowerCase().includes(q);
                        const matchId = (p.fb_page_id || p.id || '').includes(q);
                        if (!matchName && !matchId) return false;
                      }
                      if (bioFilterStatus === 'missing') return !p.brandingBio;
                      if (bioFilterStatus === 'has_bio') return !!p.brandingBio;
                      return true;
                    })
                    .map((page) => {
                      const isSelected = selectedPageIds.includes(page.id);
                      const customData = pageDescriptionsMap[page.id];
                      const currentBio = customData?.bio !== undefined ? customData.bio : (page.brandingBio || '');
                      const currentDesc = customData?.description !== undefined ? customData.description : (page.brandingDescription || '');

                      return (
                        <div
                          key={page.id}
                          className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                            isSelected
                              ? 'bg-emerald-500/5 border-emerald-500/40 shadow-xs'
                              : 'bg-black/20 border-fb-surface-hover/40 hover:border-fb-surface-hover'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleSelectPage(page.id)}
                                className="h-4 w-4 rounded border-fb-surface-hover text-emerald-600 focus:ring-emerald-500 bg-black/40 cursor-pointer shrink-0"
                              />

                              <div className="h-8 w-8 rounded-full bg-slate-800 overflow-hidden shrink-0 border border-white/10">
                                {page.brandingAvatarUrl ? (
                                  <img src={page.brandingAvatarUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <span className="material-symbols-outlined text-slate-500 text-sm flex items-center justify-center h-full">person</span>
                                )}
                              </div>

                              <div className="min-w-0">
                                <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                                  <span>{page.name}</span>
                                  {page.brandingBio ? (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-500/20 text-emerald-300 font-mono">Đã có Bio</span>
                                  ) : (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-mono">Chưa có Bio</span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  ID: {page.fb_page_id || page.id}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => setPreviewPageForBio(page)}
                                className="px-2 py-1 bg-fb-surface-hover hover:bg-slate-700 text-slate-300 text-[11px] font-medium rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                title="Xem trước trên Mockup"
                              >
                                <span className="material-symbols-outlined text-xs">visibility</span>
                                <span>Mockup</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleSyncSinglePageBio(page)}
                                className="px-2 py-1 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-400 text-[11px] font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                                title="Đồng bộ trang này lên Facebook"
                              >
                                <span className="material-symbols-outlined text-xs">send</span>
                                <span>Đẩy Facebook</span>
                              </button>
                            </div>
                          </div>

                          {/** Ô chỉnh sửa Bio & Description nhanh */}
                          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-fb-surface-hover/30">
                            <div className="sm:col-span-5 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Bio (English):</span>
                                <span className={currentBio.length > 101 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-mono'}>
                                  {currentBio.length}/101
                                </span>
                              </div>
                              <input
                                type="text"
                                value={currentBio}
                                onChange={(e) => {
                                  setPageDescriptionsMap({
                                    ...pageDescriptionsMap,
                                    [page.id]: {
                                      bio: e.target.value,
                                      description: currentDesc,
                                    }
                                  });
                                }}
                                placeholder="Bio tagline..."
                                className="w-full px-2.5 py-1.5 bg-black/40 border border-fb-surface-hover/70 rounded-lg text-[11px] text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>

                            <div className="sm:col-span-7 space-y-1">
                              <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>Description / About (English):</span>
                                <span className="font-mono text-slate-500">{currentDesc.length} chars</span>
                              </div>
                              <input
                                type="text"
                                value={currentDesc}
                                onChange={(e) => {
                                  setPageDescriptionsMap({
                                    ...pageDescriptionsMap,
                                    [page.id]: {
                                      bio: currentBio,
                                      description: e.target.value,
                                    }
                                  });
                                }}
                                placeholder="Detailed about/description..."
                                className="w-full px-2.5 py-1.5 bg-black/40 border border-fb-surface-hover/70 rounded-lg text-[11px] text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
