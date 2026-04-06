// ==================== ZORAK - المتغيرات العامة ====================
let currentUser = null;
let currentPostId = null;
let currentChatUser = null;
let currentProfileUser = null;
let selectedMediaFile = null;
let editingPostId = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let typingTimeout = null;
let currentReportPostId = null;
let selectedReportReason = null;
let readModeActive = false;
let hideLikesActive = false;
let currentImageUrls = [];
let currentImageIndex = 0;

// ==================== Infinite Scroll Variables (محسنة) ====================
let allPostsCache = [];
let currentDisplayCount = 0;
let isLoadingMore = false;
let hasMorePosts = true;
let scrollListenerActive = true;
const POSTS_PER_BATCH = 5;

// ==================== Upload Progress Variables ====================
let currentUploadProgress = 0;

// ==================== Agora Variables ====================
let agoraClient = null;
let localTracks = { videoTrack: null, audioTrack: null };
let isCallActive = false;

// ==================== Bad Words ====================
let badWordsList = [];

// ==================== Helper Functions ====================
function showToast(message, duration = 2000) {
    const toast = document.getElementById('customToast');
    if (!toast) return;
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => {
        toast.style.opacity = '0';
    }, duration);
}

function openImageViewer(images, index) {
    currentImageUrls = images;
    currentImageIndex = index;
    const viewer = document.getElementById('imageViewerModal');
    const viewerImg = document.getElementById('viewerImage');
    if (viewerImg && images[index]) viewerImg.src = images[index];
    viewer.classList.add('open');
}

function closeImageViewer() {
    document.getElementById('imageViewerModal').classList.remove('open');
}

function formatTime(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} يوم`;
    if (hours > 0) return `${hours} ساعة`;
    if (minutes > 0) return `${minutes} دقيقة`;
    return `${seconds} ثانية`;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function extractHashtags(text) {
    const hashtags = text.match(/#[\w\u0600-\u06FF]+/g) || [];
    return hashtags.map(tag => tag.substring(1));
}

function containsBadWords(text) {
    if (!text || badWordsList.length === 0) return false;
    const lowerText = text.toLowerCase();
    for (const word of badWordsList) {
        if (lowerText.includes(word.toLowerCase())) return true;
    }
    return false;
}

function filterBadWords(text) {
    if (!text || badWordsList.length === 0) return text;
    let filtered = text;
    for (const word of badWordsList) {
        const regex = new RegExp(word, 'gi');
        filtered = filtered.replace(regex, '*'.repeat(word.length));
    }
    return filtered;
}

// ==================== Upload to Cloudinary ====================
async function uploadToCloudinary(file) {
    const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);
    
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    progressDiv.classList.add('active');
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
    
    try {
        let progress = 0;
        const interval = setInterval(() => {
            if (progress < 90) {
                progress += 10;
                progressFill.style.width = progress + '%';
                progressText.textContent = progress + '%';
            }
        }, 200);
        
        const response = await fetch(url, { method: 'POST', body: formData });
        clearInterval(interval);
        
        const data = await response.json();
        if (data.secure_url) {
            progressFill.style.width = '100%';
            progressText.textContent = '100%';
            setTimeout(() => {
                progressDiv.classList.remove('active');
            }, 500);
            return data.secure_url;
        }
        throw new Error('Upload failed');
    } catch (error) {
        console.error('Cloudinary error:', error);
        showToast('فشل رفع الملف');
        progressDiv.classList.remove('active');
        return null;
    }
}

// ==================== Drag & Drop ====================
function setupDragAndDrop() {
    const dragDropArea = document.getElementById('dragDropArea');
    if (!dragDropArea) return;
    
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    ['dragenter', 'dragover'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, () => dragDropArea.classList.add('drag-over'), false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        dragDropArea.addEventListener(eventName, () => dragDropArea.classList.remove('drag-over'), false);
    });
    
    dragDropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
                const type = file.type.startsWith('image/') ? 'image' : 'video';
                handleFile(file, type);
            } else {
                showToast('الرجاء رفع ملف صورة أو فيديو فقط');
            }
        }
    }, false);
}

function handleFileSelect(input, type) {
    const file = input.files[0];
    if (file) {
        handleFile(file, type);
    }
}

function handleFile(file, type) {
    selectedMediaFile = file;
    
    const previewDiv = document.getElementById('mediaPreview');
    const previewImage = document.getElementById('previewImage');
    const previewVideo = document.getElementById('previewVideo');
    const previewFileName = document.getElementById('previewFileName');
    const previewFileSize = document.getElementById('previewFileSize');
    const dragDropArea = document.getElementById('dragDropArea');
    
    dragDropArea.style.display = 'none';
    previewDiv.classList.add('active');
    
    previewFileName.textContent = file.name;
    previewFileSize.textContent = formatFileSize(file.size);
    
    const reader = new FileReader();
    reader.onload = function(e) {
        if (type === 'image') {
            previewImage.style.display = 'block';
            previewVideo.style.display = 'none';
            previewImage.src = e.target.result;
        } else if (type === 'video') {
            previewImage.style.display = 'none';
            previewVideo.style.display = 'block';
            previewVideo.src = e.target.result;
            
            previewVideo.onloadedmetadata = function() {
                const duration = previewVideo.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                previewFileName.textContent = `${file.name} (${minutes}:${seconds.toString().padStart(2, '0')})`;
            };
        }
    };
    reader.readAsDataURL(file);
}

function removeSelectedMedia() {
    selectedMediaFile = null;
    const previewDiv = document.getElementById('mediaPreview');
    const dragDropArea = document.getElementById('dragDropArea');
    const previewImage = document.getElementById('previewImage');
    const previewVideo = document.getElementById('previewVideo');
    const postImageInput = document.getElementById('postImage');
    const postVideoInput = document.getElementById('postVideo');
    
    previewDiv.classList.remove('active');
    dragDropArea.style.display = 'block';
    previewImage.style.display = 'none';
    previewVideo.style.display = 'none';
    previewImage.src = '';
    previewVideo.src = '';
    postImageInput.value = '';
    postVideoInput.value = '';
}

// ==================== Skeleton Loader ====================
function showSkeletonLoader() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;
    
    let skeletonHtml = '';
    for (let i = 0; i < 3; i++) {
        skeletonHtml += `
            <div class="skeleton-post">
                <div class="skeleton-header">
                    <div class="skeleton skeleton-avatar"></div>
                    <div style="flex: 1;">
                        <div class="skeleton skeleton-text skeleton-title"></div>
                        <div class="skeleton skeleton-text" style="width: 40%;"></div>
                    </div>
                </div>
                <div class="skeleton skeleton-image"></div>
                <div class="skeleton skeleton-text" style="width: 90%;"></div>
                <div class="skeleton skeleton-text" style="width: 60%;"></div>
            </div>
        `;
    }
    feedContainer.innerHTML = skeletonHtml;
}

// ==================== Bad Words Management ====================
async function loadBadWordsList() {
    const snapshot = await db.ref('badWords').once('value');
    const words = snapshot.val();
    if (words) {
        badWordsList = Object.values(words);
    } else {
        badWordsList = [];
    }
    console.log('📝 ZORAK - Bad words loaded:', badWordsList.length);
}

async function addBadWord(word) {
    if (!word.trim()) return;
    const newWordRef = db.ref('badWords').push();
    await newWordRef.set(word.trim().toLowerCase());
    await loadBadWordsList();
    showToast(`✅ تمت إضافة كلمة: ${word}`);
    if (currentUser?.isAdmin) openAdminPanel();
}

async function removeBadWord(wordId, word) {
    await db.ref(`badWords/${wordId}`).remove();
    await loadBadWordsList();
    showToast(`🗑️ تم حذف كلمة: ${word}`);
    if (currentUser?.isAdmin) openAdminPanel();
}

function showAddBadWordModal() {
    const word = prompt('📝 أدخل الكلمة التي تريد منعها:');
    if (word && word.trim()) {
        addBadWord(word.trim());
    }
}

// ==================== Voice Recording ====================
async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = (event) => audioChunks.push(event.data);
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const audioUrl = await uploadToCloudinary(audioBlob);
            if (audioUrl && currentChatUser) {
                const chatId = getChatId(currentUser.uid, currentChatUser.uid);
                await db.ref(`chats/${chatId}`).push({
                    senderId: currentUser.uid,
                    audioUrl: audioUrl,
                    timestamp: Date.now(),
                    read: false
                });
                showToast('🎤 تم إرسال الرسالة الصوتية');
            }
            stream.getTracks().forEach(track => track.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('recordingIndicator').style.display = 'flex';
    } catch (error) {
        console.error('Recording error:', error);
        showToast('❌ لا يمكن الوصول إلى الميكروفون');
    }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('recordingIndicator').style.display = 'none';
    }
}

function toggleVoiceRecording() {
    isRecording ? stopVoiceRecording() : startVoiceRecording();
}

// ==================== Chat Helpers ====================
function onTyping() {
    if (!currentChatUser) return;
    const chatId = getChatId(currentUser.uid, currentChatUser.uid);
    db.ref(`typing/${chatId}/${currentUser.uid}`).set(true);
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        db.ref(`typing/${chatId}/${currentUser.uid}`).remove();
    }, 1000);
}

function listenForTyping(chatId) {
    db.ref(`typing/${chatId}`).on('value', (snapshot) => {
        const typing = snapshot.val();
        const indicator = document.getElementById('typingIndicator');
        if (typing && Object.keys(typing).length > 0 && !typing[currentUser.uid]) {
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    });
}

function getChatId(user1, user2) {
    return [user1, user2].sort().join('_');
}

// ==================== Post Interactions ====================
function addEmojiToPost(emoji) {
    const textarea = document.getElementById('postText');
    textarea.value += emoji;
    textarea.focus();
}

function addPollToCompose() {
    const pollBuilder = document.getElementById('pollBuilder');
    pollBuilder.style.display = pollBuilder.style.display === 'none' ? 'block' : 'none';
    if (pollBuilder.style.display === 'none') {
        document.getElementById('pollQuestion').value = '';
        document.getElementById('pollOption1').value = '';
        document.getElementById('pollOption2').value = '';
    }
}

function addPollOption() {
    const container = document.getElementById('pollBuilder');
    const inputCount = container.querySelectorAll('input[type="text"]').length;
    if (inputCount < 6) {
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.placeholder = `خيار ${inputCount + 1}`;
        newInput.className = 'chat-input';
        newInput.style.width = '100%';
        newInput.style.marginBottom = '4px';
        container.insertBefore(newInput, container.querySelector('button'));
    } else {
        showToast('لا يمكن إضافة أكثر من 6 خيارات');
    }
}

function createHeartAnimation(x, y) {
    const heart = document.createElement('div');
    heart.className = 'heart-animation';
    heart.innerHTML = '❤️';
    heart.style.left = x + 'px';
    heart.style.top = y + 'px';
    document.body.appendChild(heart);
    setTimeout(() => heart.remove(), 600);
}

// ==================== Video Functions ====================
function toggleVideoPlay(container) {
    const video = container.querySelector('video');
    if (video.paused) {
        video.play();
    } else {
        video.pause();
    }
}

// ==================== Settings ====================
function toggleReadMode() {
    readModeActive = !readModeActive;
    const toggle = document.getElementById('readModeToggle');
    if (readModeActive) {
        document.body.classList.add('read-mode');
        toggle.classList.add('active');
        localStorage.setItem('readMode', 'true');
    } else {
        document.body.classList.remove('read-mode');
        toggle.classList.remove('active');
        localStorage.setItem('readMode', 'false');
    }
    showToast(readModeActive ? '📖 تم تفعيل وضع القراءة' : '📖 تم إلغاء وضع القراءة');
}

function toggleHideLikes() {
    hideLikesActive = !hideLikesActive;
    const toggle = document.getElementById('hideLikesToggle');
    if (hideLikesActive) {
        toggle.classList.add('active');
        localStorage.setItem('hideLikes', 'true');
    } else {
        toggle.classList.remove('active');
        localStorage.setItem('hideLikes', 'false');
    }
    showToast(hideLikesActive ? '🔒 تم إخفاء عدد الإعجابات' : '🔒 تم إظهار عدد الإعجابات');
    refreshFeedCache();
}

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    const themeIcon = document.getElementById('themeToggle');
    if (themeIcon) {
        if (isDark) {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        }
    }
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    showToast(isDark ? '🌙 الوضع الليلي' : '☀️ الوضع النهاري');
}

async function toggleDoNotDisturb() {
    const dndToggle = document.getElementById('dndToggle');
    const isDnd = dndToggle.classList.contains('active');
    if (isDnd) {
        dndToggle.classList.remove('active');
        await db.ref(`users/${currentUser.uid}/dnd`).set(false);
        showToast('🔔 تم تفعيل الإشعارات');
    } else {
        dndToggle.classList.add('active');
        await db.ref(`users/${currentUser.uid}/dnd`).set(true);
        showToast('🔕 تم تفعيل عدم الإزعاج');
    }
}

async function loadDndStatus() {
    const snapshot = await db.ref(`users/${currentUser.uid}/dnd`).once('value');
    const isDnd = snapshot.val();
    const dndToggle = document.getElementById('dndToggle');
    if (isDnd && dndToggle) dndToggle.classList.add('active');
    else if (dndToggle) dndToggle.classList.remove('active');
}

// ==================== Pin Comment & Quote ====================
async function pinComment(postId, commentId) {
    await db.ref(`posts/${postId}/pinnedComment`).set(commentId);
    showToast('📌 تم تثبيت التعليق');
    loadComments(postId);
}

function quotePost(postId, originalText, originalUser) {
    openCompose();
    document.getElementById('postText').value = `اقتباس من @${originalUser}: "${originalText.substring(0, 100)}"\n\n`;
    window.quoteOriginalPostId = postId;
}

// ==================== Video Call ====================
async function initAgoraCall() {
    if (!agoraClient) agoraClient = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
    return agoraClient;
}

async function startVideoCallWithAgora(channelName, userId) {
    try {
        const client = await initAgoraCall();
        await client.join(AGORA_APP_ID, channelName, null, userId);
        localTracks.videoTrack = await AgoraRTC.createCameraVideoTrack();
        localTracks.audioTrack = await AgoraRTC.createMicrophoneAudioTrack();
        await client.publish([localTracks.videoTrack, localTracks.audioTrack]);
        const localPlayer = document.getElementById('localVideo');
        if (localPlayer) localTracks.videoTrack.play(localPlayer);
        client.on("user-published", async (user, mediaType) => {
            await client.subscribe(user, mediaType);
            if (mediaType === "video") {
                const remotePlayer = document.getElementById('remoteVideo');
                if (remotePlayer) user.videoTrack.play(remotePlayer);
            }
            if (mediaType === "audio") user.audioTrack.play();
        });
        isCallActive = true;
        showToast('📹 تم بدء المكالمة');
    } catch (error) {
        console.error('Video call error:', error);
        showToast('❌ فشل بدء المكالمة');
    }
}

async function endVideoCall() {
    if (agoraClient) {
        if (localTracks.videoTrack) localTracks.videoTrack.close();
        if (localTracks.audioTrack) localTracks.audioTrack.close();
        await agoraClient.leave();
        isCallActive = false;
        showToast('📞 تم إنهاء المكالمة');
    }
    document.getElementById('videoCallModal').classList.remove('open');
}

async function startVideoCallWithCurrentUser() {
    if (!currentChatUser) return;
    const channelName = `call_${getChatId(currentUser.uid, currentChatUser.uid)}`;
    document.getElementById('videoCallModal').classList.add('open');
    await startVideoCallWithAgora(channelName, currentUser.uid);
    await db.ref(`notifications/${currentChatUser.uid}`).push({
        type: 'call', userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.name,
        channelName: channelName, timestamp: Date.now(), read: false
    });
}

async function startVideoCallWithUser(userId) {
    const channelName = `call_${getChatId(currentUser.uid, userId)}`;
    document.getElementById('videoCallModal').classList.add('open');
    await startVideoCallWithAgora(channelName, currentUser.uid);
    await db.ref(`notifications/${userId}`).push({
        type: 'call', userId: currentUser.uid,
        userName: currentUser.displayName || currentUser.name,
        channelName: channelName, timestamp: Date.now(), read: false
    });
}

// ==================== Logout (معدل - توجيه إلى auth.html) ====================
async function logout() {
    try {
        await auth.signOut();
        localStorage.removeItem('auth_logged_in');
        showToast('👋 تم تسجيل الخروج بنجاح');
        setTimeout(() => {
            window.location.href = 'auth.html';
        }, 1000);
    } catch (error) {
        console.error('Logout error:', error);
        showToast('❌ حدث خطأ أثناء تسجيل الخروج');
    }
}

// ==================== Profile Views ====================
async function recordProfileView(viewedUserId) {
    if (viewedUserId === currentUser.uid) return;
    await db.ref(`profileViews/${viewedUserId}/${currentUser.uid}`).set({
        viewerId: currentUser.uid, viewerName: currentUser.displayName || currentUser.name,
        viewerAvatar: currentUser.avatar || '', timestamp: Date.now()
    });
}

async function openProfileViews() {
    const snapshot = await db.ref(`profileViews/${currentProfileUser || currentUser.uid}`).once('value');
    const views = snapshot.val();
    const container = document.getElementById('profileViewsList');
    if (!views) {
        container.innerHTML = '<div class="text-center p-4 text-gray-500">👁️ لا توجد مشاهدات بعد</div>';
    } else {
        let html = '';
        const viewsArray = Object.values(views).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50);
        for (const view of viewsArray) {
            html += `<div class="follower-item fade-in-left" onclick="closeProfileViews(); openProfile('${view.viewerId}')">
                <div class="post-avatar" style="width: 44px; height: 44px;">${view.viewerAvatar ? `<img src="${view.viewerAvatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
                <div><div style="font-weight: 600;">${escapeHtml(view.viewerName)}</div><div style="font-size: 11px; color: #9ca3af;">${formatTime(view.timestamp)}</div></div>
            </div>`;
        }
        container.innerHTML = html;
    }
    document.getElementById('profileViewsPanel').classList.add('open');
}

function closeProfileViews() {
    document.getElementById('profileViewsPanel').classList.remove('open');
}

// ==================== Saved Posts ====================
async function savePost(postId) {
    const saveRef = db.ref(`savedPosts/${currentUser.uid}/${postId}`);
    const snapshot = await saveRef.once('value');
    if (snapshot.exists()) {
        await saveRef.remove();
        showToast('📌 تم إزالة من القائمة المحفوظة');
    } else {
        await saveRef.set(true);
        showToast('💾 تم حفظ المنشور');
    }
    refreshFeedCache();
}

async function openSavedPosts() {
    const snapshot = await db.ref(`savedPosts/${currentUser.uid}`).once('value');
    const savedPosts = snapshot.val();
    const container = document.getElementById('savedPostsGrid');
    if (!savedPosts) {
        container.innerHTML = '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">📭 لا توجد منشورات محفوظة</div>';
    } else {
        let html = '';
        for (const postId of Object.keys(savedPosts)) {
            const postSnapshot = await db.ref(`posts/${postId}`).once('value');
            const post = postSnapshot.val();
            if (post) {
                html += `<div class="grid-item" onclick="openComments('${postId}')">
                    ${post.mediaUrl ? (post.mediaType === 'image' ? `<img src="${post.mediaUrl}">` : `<video src="${post.mediaUrl}"></video>`) : '<div class="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800"><i class="fa-regular fa-file-lines text-2xl text-gray-500"></i></div>'}
                </div>`;
            }
        }
        container.innerHTML = html || '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">📭 لا توجد منشورات محفوظة</div>';
    }
    document.getElementById('savedPostsPanel').classList.add('open');
}

function closeSavedPosts() {
    document.getElementById('savedPostsPanel').classList.remove('open');
}

// ==================== Pin Post ====================
async function pinPost(postId) {
    const currentPinned = await db.ref(`users/${currentUser.uid}/pinnedPost`).once('value');
    if (currentPinned.val() === postId) {
        await db.ref(`users/${currentUser.uid}/pinnedPost`).remove();
        showToast('📌 تم إلغاء تثبيت المنشور');
    } else {
        await db.ref(`users/${currentUser.uid}/pinnedPost`).set(postId);
        showToast('📌 تم تثبيت المنشور');
    }
    refreshFeedCache();
    if (currentProfileUser) loadProfilePosts(currentProfileUser);
}

// ==================== Report ====================
function openReportModal(postId) {
    currentReportPostId = postId;
    selectedReportReason = null;
    document.querySelectorAll('.report-reason').forEach(el => el.classList.remove('selected'));
    document.getElementById('reportModal').classList.add('open');
}

function selectReportReason(element, reason) {
    document.querySelectorAll('.report-reason').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    selectedReportReason = reason;
}

function closeReportModal() {
    document.getElementById('reportModal').classList.remove('open');
    currentReportPostId = null;
    selectedReportReason = null;
}

async function submitReport() {
    if (!selectedReportReason || !currentReportPostId) return showToast('⚠️ الرجاء اختيار سبب الإبلاغ');
    await db.ref(`reports/${currentReportPostId}`).push({
        reporterId: currentUser.uid, reporterName: currentUser.displayName || currentUser.name,
        reason: selectedReportReason, timestamp: Date.now()
    });
    showToast('📢 تم إرسال البلاغ، شكراً لك');
    closeReportModal();
}

// ==================== Block & Mute ====================
async function muteUser(userId, minutes = 60) {
    const muteUntil = Date.now() + (minutes * 60 * 1000);
    await db.ref(`users/${userId}/mutedUntil`).set(muteUntil);
    showToast(`🔇 تم تقييد المستخدم لمدة ${minutes} دقيقة`);
    openAdminPanel();
}

async function isUserMuted(userId) {
    const snapshot = await db.ref(`users/${userId}/mutedUntil`).once('value');
    const muteUntil = snapshot.val();
    return muteUntil && muteUntil > Date.now();
}

async function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadToCloudinary(file);
            if (url) {
                await db.ref(`users/${currentUser.uid}`).update({ avatar: url });
                currentUser.avatar = url;
                if (currentProfileUser) openProfile(currentProfileUser);
                else openProfile(currentUser.uid);
                showToast('🖼️ تم تغيير الصورة الشخصية بنجاح');
            }
        }
    };
    input.click();
}

async function changeCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const url = await uploadToCloudinary(file);
            if (url) {
                await db.ref(`users/${currentUser.uid}`).update({ cover: url });
                currentUser.cover = url;
                if (currentProfileUser) openProfile(currentProfileUser);
                else openProfile(currentUser.uid);
                showToast('🖼️ تم تغيير صورة الغلاف بنجاح');
            }
        }
    };
    input.click();
}

async function blockUser(userId) {
    await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).set(true);
    showToast('🚫 تم حظر المستخدم');
    refreshFeedCache();
}

async function unblockUser(userId) {
    await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).remove();
    showToast('✅ تم إلغاء حظر المستخدم');
    refreshFeedCache();
}

async function isBlocked(userId) {
    const snapshot = await db.ref(`users/${currentUser.uid}/blockedUsers/${userId}`).once('value');
    return snapshot.exists();
}

// ==================== Create Post ====================
async function createPost() {
    const publishBtn = document.getElementById('publishPostBtn');
    if (publishBtn) {
        publishBtn.style.transform = 'scale(0.95)';
        setTimeout(() => { if(publishBtn) publishBtn.style.transform = 'scale(1)'; }, 150);
    }
    
    let text = document.getElementById('postText')?.value;
    if (containsBadWords(text)) return showToast('⚠️ المنشور يحتوي على كلمات ممنوعة');
    if (!text && !selectedMediaFile) return showToast('⚠️ الرجاء كتابة نص أو إضافة وسائط');
    text = filterBadWords(text);
    if (await isUserMuted(currentUser.uid)) return showToast('⚠️ أنت مقيد مؤقتاً ولا يمكنك النشر');

    let mediaUrl = "", mediaType = "";
    if (selectedMediaFile) {
        mediaType = selectedMediaFile.type.split('/')[0];
        mediaUrl = await uploadToCloudinary(selectedMediaFile);
        if (!mediaUrl) return;
    }

    const hashtags = extractHashtags(text);
    const postRef = db.ref('posts').push();
    
    let quoteData = null;
    if (window.quoteOriginalPostId) {
        const originalPostSnapshot = await db.ref(`posts/${window.quoteOriginalPostId}`).once('value');
        const originalPost = originalPostSnapshot.val();
        if (originalPost) {
            quoteData = { originalPostId: window.quoteOriginalPostId, originalText: originalPost.text, originalUser: originalPost.userName };
        }
        delete window.quoteOriginalPostId;
    }
    
    let pollData = null;
    const pollQuestion = document.getElementById('pollQuestion')?.value;
    if (pollQuestion) {
        const options = [];
        const optionInputs = document.querySelectorAll('#pollBuilder input[type="text"]');
        for (let i = 0; i < optionInputs.length; i++) {
            if (optionInputs[i].value) options.push(optionInputs[i].value);
        }
        if (options.length >= 2) {
            pollData = { question: pollQuestion, options: options, votes: {}, totalVotes: 0 };
        }
    }
    
    await postRef.set({
        id: postRef.key, userId: currentUser.uid, userName: currentUser.displayName || currentUser.name,
        userAvatar: currentUser.avatar || "", text: text, mediaUrl: mediaUrl, mediaType: mediaType,
        hashtags: hashtags, likes: {}, views: 0, commentsCount: 0, edited: false,
        quote: quoteData, poll: pollData, timestamp: Date.now()
    });
    
    for (const tag of hashtags) {
        await db.ref(`hashtags/${tag.toLowerCase()}/${postRef.key}`).set(true);
    }

    document.getElementById('postText').value = "";
    removeSelectedMedia();
    document.getElementById('pollBuilder').style.display = "none";
    document.getElementById('pollQuestion').value = "";
    document.getElementById('pollOption1').value = "";
    document.getElementById('pollOption2').value = "";
    selectedMediaFile = null;
    editingPostId = null;
    closeCompose();
    
    await refreshFeedCache();
    loadTrendingHashtags();
    showToast('✨ تم نشر المنشور بنجاح!');
}

// ==================== Delete Post ====================
async function deletePost(postId) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المنشور؟')) return;
    const postSnapshot = await db.ref(`posts/${postId}`).once('value');
    const post = postSnapshot.val();
    if (post.userId !== currentUser.uid && !currentUser.isAdmin) return showToast('❌ لا يمكنك حذف منشور ليس لك');
    if (post.hashtags) {
        for (const tag of post.hashtags) {
            await db.ref(`hashtags/${tag.toLowerCase()}/${postId}`).remove();
        }
    }
    await db.ref(`posts/${postId}`).remove();
    await refreshFeedCache();
    loadTrendingHashtags();
    showToast('🗑️ تم حذف المنشور');
}

// ==================== Like Post ====================
async function likePost(postId) {
    const likeRef = db.ref(`posts/${postId}/likes/${currentUser.uid}`);
    const snapshot = await likeRef.once('value');
    const wasLiked = snapshot.exists();
    
    const postCard = document.querySelector(`.post-card[data-post-id="${postId}"]`);
    if (postCard) {
        const likeButton = postCard.querySelector('.post-action:first-child');
        const likesSpan = postCard.querySelector('.post-likes');
        if (likeButton) {
            if (wasLiked) likeButton.classList.remove('active');
            else likeButton.classList.add('active');
        }
        if (likesSpan && !hideLikesActive) {
            let currentCount = parseInt(likesSpan.textContent) || 0;
            currentCount = wasLiked ? currentCount - 1 : currentCount + 1;
            likesSpan.textContent = `${currentCount} إعجاب`;
            likesSpan.style.display = currentCount === 0 ? 'none' : 'block';
        }
    }
    
    if (wasLiked) {
        await likeRef.remove();
    } else {
        await likeRef.set(true);
        const postSnapshot = await db.ref(`posts/${postId}`).once('value');
        const post = postSnapshot.val();
        if (post && post.userId !== currentUser.uid) {
            const dndSnapshot = await db.ref(`users/${post.userId}/dnd`).once('value');
            if (!dndSnapshot.val()) {
                await db.ref(`notifications/${post.userId}`).push({
                    type: 'like', userId: currentUser.uid,
                    userName: currentUser.displayName || currentUser.name,
                    postId: postId, timestamp: Date.now(), read: false
                });
            }
        }
    }
}

// ==================== Share Post ====================
async function sharePost(postId) {
    const postSnapshot = await db.ref(`posts/${postId}`).once('value');
    const post = postSnapshot.val();
    const shareRef = db.ref('posts').push();
    await shareRef.set({
        id: shareRef.key, userId: currentUser.uid, userName: currentUser.displayName || currentUser.name,
        userAvatar: currentUser.avatar || "", text: `🔄 شارك منشور: ${post.text.substring(0, 100)}`,
        originalPostId: postId, originalUser: post.userName, timestamp: Date.now()
    });
    await refreshFeedCache();
    showToast('🔄 تمت المشاركة!');
}

// ==================== Vote Poll ====================
async function votePoll(postId, optionIndex) {
    const postRef = db.ref(`posts/${postId}/poll`);
    const snapshot = await postRef.once('value');
    const poll = snapshot.val();
    if (poll && poll.votes && poll.votes[currentUser.uid]) return showToast('✅ لقد صوت مسبقاً');
    await db.ref(`posts/${postId}/poll/votes/${currentUser.uid}`).set(optionIndex);
    await db.ref(`posts/${postId}/poll/totalVotes`).transaction(current => (current || 0) + 1);
    refreshFeedCache();
}

// ==================== Increment Views ====================
async function incrementPostViews(postId) {
    await db.ref(`posts/${postId}/views`).transaction(current => (current || 0) + 1);
}

// ==================== Scheduled Posts ====================
async function checkScheduledPosts() {
    const snapshot = await db.ref(`scheduledPosts/${currentUser?.uid}`).once('value');
    const scheduled = snapshot.val();
    if (scheduled) {
        for (const [id, post] of Object.entries(scheduled)) {
            if (post.scheduleTime <= Date.now()) {
                const postRef = db.ref('posts').push();
                await postRef.set({
                    id: postRef.key, userId: post.userId, userName: post.userName,
                    userAvatar: post.userAvatar, text: post.text, mediaUrl: post.mediaUrl,
                    mediaType: post.mediaType, hashtags: extractHashtags(post.text),
                    likes: {}, views: 0, commentsCount: 0, edited: false, timestamp: Date.now()
                });
                await db.ref(`scheduledPosts/${currentUser.uid}/${id}`).remove();
                showToast('📅 تم نشر المنشور المجدول');
                await refreshFeedCache();
            }
        }
    }
}

// ==================== Trending Hashtags ====================
async function loadTrendingHashtags() {
    const hashtagSnapshot = await db.ref('hashtags').once('value');
    const hashtags = hashtagSnapshot.val();
    if (!hashtags) return;
    const trending = [];
    for (const [tag, posts] of Object.entries(hashtags)) {
        trending.push({ tag, count: Object.keys(posts).length });
    }
    trending.sort((a, b) => b.count - a.count);
    const top5 = trending.slice(0, 5);
    const container = document.getElementById('trendingList');
    if (container) {
        container.innerHTML = top5.map((item, index) => `
            <div class="trending-item fade-in-right" onclick="searchHashtag('${item.tag}')">
                <div class="trending-rank" style="font-size: 12px; color: #667eea;">#${index + 1}</div>
                <div class="trending-hashtag" style="font-weight: 600;">#${escapeHtml(item.tag)}</div>
                <div class="trending-count" style="font-size: 11px; color: #9ca3af;">${item.count} منشور</div>
            </div>
        `).join('');
    }
}

// ==================== Infinite Scroll - محسن وسلس جداً ====================

async function loadAllPostsToCache() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;
    
    showSkeletonLoader();
    
    const snapshot = await db.ref('posts').once('value');
    const posts = snapshot.val();
    
    if (!posts || Object.keys(posts).length === 0) {
        feedContainer.innerHTML = '<div class="text-center p-8 text-gray-500 fade-in-up">✨ لا توجد منشورات بعد - كن أول من ينشر! ✨</div>';
        hasMorePosts = false;
        return;
    }
    
    let postsArray = Object.values(posts).sort((a, b) => b.timestamp - a.timestamp);
    
    if (currentUser) {
        const blockedSnapshot = await db.ref(`users/${currentUser.uid}/blockedUsers`).once('value');
        const blockedUsers = blockedSnapshot.val() || {};
        postsArray = postsArray.filter(post => !blockedUsers[post.userId]);
    }
    
    if (currentUser) {
        const pinnedPostId = await db.ref(`users/${currentUser.uid}/pinnedPost`).once('value');
        const pinnedId = pinnedPostId.val();
        if (pinnedId) {
            const pinnedIndex = postsArray.findIndex(p => p.id === pinnedId);
            if (pinnedIndex > -1) {
                const pinnedPost = postsArray[pinnedIndex];
                postsArray.splice(pinnedIndex, 1);
                postsArray.unshift(pinnedPost);
            }
        }
    }
    
    allPostsCache = postsArray;
    hasMorePosts = allPostsCache.length > POSTS_PER_BATCH;
    currentDisplayCount = POSTS_PER_BATCH;
    
    feedContainer.innerHTML = '';
    await displayPosts(0, POSTS_PER_BATCH);
    
    if (scrollListenerActive) {
        setupSmoothScrollListener();
    }
}

async function displayPosts(startIndex, count) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;
    
    const endIndex = Math.min(startIndex + count, allPostsCache.length);
    const postsToShow = allPostsCache.slice(startIndex, endIndex);
    
    for (const post of postsToShow) {
        await incrementPostViews(post.id);
        
        const userInfoSnapshot = await db.ref(`users/${post.userId}`).once('value');
        const userInfo = userInfoSnapshot.val();
        const isUserVerified = userInfo?.verified || false;
        const isLiked = post.likes && post.likes[currentUser?.uid];
        const likesCount = post.likes ? Object.keys(post.likes).length : 0;
        const isOwner = post.userId === currentUser?.uid;
        let isPinned = false;
        if (currentUser) {
            const pinnedPostId = await db.ref(`users/${currentUser.uid}/pinnedPost`).once('value');
            isPinned = pinnedPostId.val() === post.id;
        }
        const savedSnapshot = currentUser ? await db.ref(`savedPosts/${currentUser.uid}/${post.id}`).once('value') : { exists: () => false };
        const isSaved = savedSnapshot.exists();
        
        let formattedText = escapeHtml(post.text);
        if (post.hashtags) {
            post.hashtags.forEach(tag => {
                const regex = new RegExp(`#${tag}`, 'gi');
                formattedText = formattedText.replace(regex, `<span class="post-hashtags" onclick="searchHashtag('${tag}')">#${tag}</span>`);
            });
        }
        formattedText = formattedText.replace(/@(\w+)/g, '<span class="post-hashtags" onclick="searchUser(\'$1\')">@$1</span>');
        
        let pollHtml = '';
        if (post.poll && post.poll.question) {
            pollHtml = '<div class="poll-container">';
            pollHtml += `<div style="font-weight: 600; margin-bottom: 8px;">📊 ${escapeHtml(post.poll.question)}</div>`;
            for (let i = 0; i < post.poll.options.length; i++) {
                const voteCount = post.poll.votes ? Object.values(post.poll.votes).filter(v => v === i).length : 0;
                const percentage = post.poll.totalVotes > 0 ? (voteCount / post.poll.totalVotes * 100).toFixed(1) : 0;
                pollHtml += `
                    <div class="poll-option" onclick="votePoll('${post.id}', ${i})">
                        <div class="poll-progress" style="width: ${percentage}%;"></div>
                        <div class="poll-option-text">
                            <span>${escapeHtml(post.poll.options[i])}</span>
                            ${!hideLikesActive ? `<span>${percentage}% (${voteCount} صوت)</span>` : ''}
                        </div>
                    </div>
                `;
            }
            pollHtml += `<div style="font-size: 11px; color: #9ca3af; margin-top: 8px;">${post.poll.totalVotes || 0} صوت</div>`;
            pollHtml += '</div>';
        }
        
        let quoteHtml = '';
        if (post.quote) {
            quoteHtml = `
                <div class="quote-post" onclick="openComments('${post.quote.originalPostId}')">
                    <div style="font-weight: 600;">@${escapeHtml(post.quote.originalUser)}</div>
                    <div style="font-size: 13px;">${escapeHtml(post.quote.originalText?.substring(0, 100))}</div>
                </div>
            `;
        }
        
        let mediaHtml = '';
        if (post.mediaUrl) {
            if (post.mediaType === 'image') {
                mediaHtml = `<img src="${post.mediaUrl}" class="post-image" loading="lazy" onclick="event.stopPropagation(); openImageViewer(['${post.mediaUrl}'], 0)">`;
            } else if (post.mediaType === 'video') {
                mediaHtml = `
                    <div class="video-container" onclick="event.stopPropagation(); toggleVideoPlay(this)">
                        <video src="${post.mediaUrl}" class="post-video" preload="metadata" playsinline></video>
                        <div class="video-overlay">
                            <button onclick="event.stopPropagation(); this.parentElement.parentElement.querySelector('video').play()"><i class="fa-solid fa-play"></i></button>
                            <button onclick="event.stopPropagation(); this.parentElement.parentElement.querySelector('video').pause()"><i class="fa-solid fa-pause"></i></button>
                            <button onclick="event.stopPropagation(); this.parentElement.parentElement.querySelector('video').muted = !this.parentElement.parentElement.querySelector('video').muted"><i class="fa-solid fa-volume-up"></i></button>
                        </div>
                    </div>
                `;
            }
        }
        
        const postHtml = `
            <div class="post-card ${isPinned ? 'pinned' : ''}" data-post-id="${post.id}" ondblclick="likePost('${post.id}'); createHeartAnimation(event.clientX, event.clientY)">
                ${isPinned ? '<div class="pinned-badge"><i class="fa-solid fa-thumbtack"></i> مثبت</div>' : ''}
                <div class="post-header">
                    <div class="post-user-info" onclick="openProfile('${post.userId}')">
                        <div class="post-avatar">${post.userAvatar ? `<img src="${post.userAvatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
                        <div>
                            <div class="post-username">
                                ${escapeHtml(post.userName)}
                                ${isUserVerified ? '<i class="fa-solid fa-circle-check verified-badge" style="color: #3b82f6; font-size: 14px;"></i>' : ''}
                            </div>
                            <div class="post-time">${formatTime(post.timestamp)} ${post.edited ? '· معدل' : ''}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 12px;">
                        ${(isOwner || currentUser?.isAdmin) ? `<button class="post-menu" onclick="event.stopPropagation(); deletePost('${post.id}')"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                        ${isOwner ? `<button class="post-menu" onclick="event.stopPropagation(); pinPost('${post.id}')"><i class="fa-solid fa-thumbtack"></i></button>` : ''}
                        <button class="post-menu" onclick="event.stopPropagation(); savePost('${post.id}')"><i class="fa-regular fa-bookmark" style="${isSaved ? 'color: #667eea;' : ''}"></i></button>
                        <button class="post-menu" onclick="event.stopPropagation(); quotePost('${post.id}', '${escapeHtml(post.text)}', '${escapeHtml(post.userName)}')"><i class="fa-solid fa-quote-right"></i></button>
                        <button class="post-menu" onclick="event.stopPropagation(); openReportModal('${post.id}')"><i class="fa-regular fa-flag"></i></button>
                    </div>
                </div>
                ${mediaHtml}
                ${pollHtml}
                ${quoteHtml}
                <div class="post-actions">
                    <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost('${post.id}')"><i class="fa-regular fa-heart"></i></button>
                    <button class="post-action" onclick="openComments('${post.id}')"><i class="fa-regular fa-comment"></i></button>
                    <button class="post-action" onclick="sharePost('${post.id}')"><i class="fa-regular fa-paper-plane"></i></button>
                </div>
                ${likesCount > 0 && !hideLikesActive ? `<div class="post-likes">❤️ ${likesCount} إعجاب</div>` : ''}
                <div class="post-caption"><span onclick="openProfile('${post.userId}')">${escapeHtml(post.userName)}</span> ${formattedText}</div>
                ${post.commentsCount > 0 ? `<div class="post-comments" onclick="openComments('${post.id}')">💬 عرض جميع التعليقات (${post.commentsCount})</div>` : ''}
                <div class="post-views"><i class="fa-regular fa-eye"></i> ${post.views || 0} مشاهدة</div>
            </div>
        `;
        
        feedContainer.insertAdjacentHTML('beforeend', postHtml);
    }
    
    if (hasMorePosts && endIndex < allPostsCache.length) {
        let loadMoreDiv = document.getElementById('loadMoreTrigger');
        if (!loadMoreDiv) {
            loadMoreDiv = document.createElement('div');
            loadMoreDiv.id = 'loadMoreTrigger';
            loadMoreDiv.className = 'load-more-btn';
            loadMoreDiv.innerHTML = '<div class="spinner" style="width: 24px; height: 24px;"></div><span>جاري تحميل المزيد...</span>';
            loadMoreDiv.style.display = 'none';
            feedContainer.appendChild(loadMoreDiv);
        }
    } else if (allPostsCache.length > 0 && endIndex >= allPostsCache.length) {
        const loadMoreDiv = document.getElementById('loadMoreTrigger');
        if (loadMoreDiv) loadMoreDiv.remove();
        const endMessage = document.createElement('div');
        endMessage.className = 'text-center p-4 text-gray-500 fade-in-up';
        endMessage.innerHTML = '✨ لقد وصلت إلى نهاية ZORAK ✨';
        feedContainer.appendChild(endMessage);
    }
}

async function loadMorePosts() {
    if (isLoadingMore || !hasMorePosts) return;
    
    isLoadingMore = true;
    const loadMoreDiv = document.getElementById('loadMoreTrigger');
    if (loadMoreDiv) loadMoreDiv.style.display = 'flex';
    
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const startIndex = currentDisplayCount;
    const newEndIndex = Math.min(startIndex + POSTS_PER_BATCH, allPostsCache.length);
    
    if (startIndex < allPostsCache.length) {
        await displayPosts(startIndex, POSTS_PER_BATCH);
        currentDisplayCount = newEndIndex;
        hasMorePosts = currentDisplayCount < allPostsCache.length;
    } else {
        hasMorePosts = false;
    }
    
    if (loadMoreDiv) loadMoreDiv.style.display = 'none';
    isLoadingMore = false;
}

function setupSmoothScrollListener() {
    const handleScroll = () => {
        if (isLoadingMore || !hasMorePosts) return;
        
        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.body.offsetHeight - 500;
        
        if (scrollPosition >= threshold) {
            loadMorePosts();
        }
    };
    
    window.removeEventListener('scroll', handleScroll);
    window.addEventListener('scroll', handleScroll, { passive: true });
}

async function refreshFeedCache() {
    if (!currentUser) return;
    
    const snapshot = await db.ref('posts').once('value');
    const posts = snapshot.val();
    
    if (!posts || Object.keys(posts).length === 0) {
        allPostsCache = [];
        hasMorePosts = false;
        currentDisplayCount = 0;
        const feedContainer = document.getElementById('feedContainer');
        if (feedContainer) {
            feedContainer.innerHTML = '<div class="text-center p-8 text-gray-500 fade-in-up">✨ لا توجد منشورات بعد - كن أول من ينشر! ✨</div>';
        }
        return;
    }
    
    let postsArray = Object.values(posts).sort((a, b) => b.timestamp - a.timestamp);
    
    const blockedSnapshot = await db.ref(`users/${currentUser.uid}/blockedUsers`).once('value');
    const blockedUsers = blockedSnapshot.val() || {};
    postsArray = postsArray.filter(post => !blockedUsers[post.userId]);
    
    const pinnedPostId = await db.ref(`users/${currentUser.uid}/pinnedPost`).once('value');
    const pinnedId = pinnedPostId.val();
    
    if (pinnedId) {
        const pinnedIndex = postsArray.findIndex(p => p.id === pinnedId);
        if (pinnedIndex > -1) {
            const pinnedPost = postsArray[pinnedIndex];
            postsArray.splice(pinnedIndex, 1);
            postsArray.unshift(pinnedPost);
        }
    }
    
    allPostsCache = postsArray;
    hasMorePosts = allPostsCache.length > POSTS_PER_BATCH;
    currentDisplayCount = Math.min(POSTS_PER_BATCH, allPostsCache.length);
    
    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = '';
        await displayPosts(0, currentDisplayCount);
    }
}

function resetInfiniteScroll() {
    isLoadingMore = false;
    hasMorePosts = true;
    allPostsCache = [];
    currentDisplayCount = 0;
    scrollListenerActive = true;
}

async function loadFeed() {
    await loadAllPostsToCache();
}

// ==================== Search ====================
async function searchUser(username) {
    openSearch();
    document.getElementById('searchInput').value = username;
    await searchAll();
}

async function searchHashtag(tag) {
    openSearch();
    document.getElementById('searchInput').value = `#${tag}`;
    await searchAll();
}

async function searchAll() {
    const query = document.getElementById('searchInput')?.value.toLowerCase();
    if (!query) {
        document.getElementById('searchResults').innerHTML = '';
        return;
    }
    const usersSnapshot = await db.ref('users').once('value');
    const users = usersSnapshot.val();
    const hashtagSnapshot = await db.ref('hashtags').once('value');
    const hashtags = hashtagSnapshot.val();
    let results = [];
    if (users) results.push(...Object.values(users).filter(u => u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query)).map(u => ({ type: 'user', data: u })));
    if (hashtags && query.startsWith('#')) {
        const tag = query.substring(1);
        if (hashtags[tag]) results.push({ type: 'hashtag', data: { tag: tag, count: Object.keys(hashtags[tag]).length } });
    } else if (hashtags) {
        for (const [tag, posts] of Object.entries(hashtags)) {
            if (tag.toLowerCase().includes(query)) results.push({ type: 'hashtag', data: { tag: tag, count: Object.keys(posts).length } });
        }
    }
    let html = '';
    for (const result of results) {
        if (result.type === 'user') html += `<div class="follower-item fade-in-left" onclick="closeSearch(); openProfile('${result.data.uid}')"><div class="post-avatar" style="width: 44px; height: 44px;">${result.data.avatar ? `<img src="${result.data.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div><div><div style="font-weight: 600;">${escapeHtml(result.data.name)}</div><div style="font-size: 12px; color: #9ca3af;">${escapeHtml(result.data.email)}</div></div></div>`;
        else if (result.type === 'hashtag') html += `<div class="follower-item fade-in-left" onclick="closeSearch(); searchHashtag('${result.data.tag}')"><div class="post-avatar" style="width: 44px; height: 44px; background: linear-gradient(135deg, #667eea, #764ba2); display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-hashtag text-white text-xl"></i></div><div><div style="font-weight: 600; color: #667eea;">#${escapeHtml(result.data.tag)}</div><div style="font-size: 12px; color: #9ca3af;">${result.data.count} منشور</div></div></div>`;
    }
    document.getElementById('searchResults').innerHTML = html || '<div class="text-center p-4 text-gray-500 fade-in-up">🔍 لا توجد نتائج</div>';
}

// ==================== Comments ====================
async function openComments(postId) {
    currentPostId = postId;
    document.getElementById('commentsPanel').classList.add('open');
    await loadComments(postId);
}

async function loadComments(postId) {
    const snapshot = await db.ref(`comments/${postId}`).once('value');
    const comments = snapshot.val();
    const commentsList = document.getElementById('commentsList');
    if (!commentsList) return;
    const pinnedCommentId = await db.ref(`posts/${postId}/pinnedComment`).once('value');
    const pinnedId = pinnedCommentId.val();
    if (!comments) {
        commentsList.innerHTML = '<div class="text-center p-4 text-gray-500">💬 لا توجد تعليقات</div>';
        return;
    }
    let commentsArray = Object.entries(comments).map(([id, comment]) => ({ id, ...comment }));
    if (pinnedId) {
        const pinnedIndex = commentsArray.findIndex(c => c.id === pinnedId);
        if (pinnedIndex > -1) {
            const pinnedComment = commentsArray[pinnedIndex];
            commentsArray.splice(pinnedIndex, 1);
            commentsArray.unshift(pinnedComment);
        }
    }
    let html = '';
    for (const comment of commentsArray) {
        const userSnapshot = await db.ref(`users/${comment.userId}`).once('value');
        const userData = userSnapshot.val();
        const isCommentOwner = comment.userId === currentUser?.uid;
        const isVerified = userData?.verified || false;
        html += `<div class="chat-message"><div class="message-bubble"><div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;"><span style="font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px;" onclick="closeComments(); openProfile('${comment.userId}')">${escapeHtml(userData?.name || 'مستخدم')}${isVerified ? '<i class="fa-solid fa-circle-check" style="color: #3b82f6; font-size: 12px;"></i>' : ''}</span><span style="font-size: 10px; color: #9ca3af;">${formatTime(comment.timestamp)}</span>${comment.id === pinnedId ? '<span style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; padding: 2px 6px; border-radius: 12px; font-size: 9px;">📌 مثبت</span>' : ''}${isCommentOwner ? `<button class="post-menu" onclick="pinComment('${postId}', '${comment.id}')" style="margin-right: auto;"><i class="fa-solid fa-thumbtack"></i></button>` : ''}</div><div>${escapeHtml(filterBadWords(comment.text))}</div></div></div>`;
    }
    commentsList.innerHTML = html;
}

async function addComment() {
    let text = document.getElementById('commentInput')?.value;
    if (!text || !currentPostId) return;
    if (containsBadWords(text)) return showToast('⚠️ التعليق يحتوي على كلمات ممنوعة');
    text = filterBadWords(text);
    if (await isUserMuted(currentUser.uid)) return showToast('⚠️ أنت مقيد مؤقتاً ولا يمكنك التعليق');
    const commentRef = db.ref(`comments/${currentPostId}`).push();
    await commentRef.set({ userId: currentUser.uid, userName: currentUser.displayName || currentUser.name, text: text, timestamp: Date.now() });
    const postRef = db.ref(`posts/${currentPostId}`);
    const snapshot = await postRef.once('value');
    const post = snapshot.val();
    await postRef.update({ commentsCount: (post.commentsCount || 0) + 1 });
    if (post.userId !== currentUser.uid) {
        const dndSnapshot = await db.ref(`users/${post.userId}/dnd`).once('value');
        if (!dndSnapshot.val()) {
            await db.ref(`notifications/${post.userId}`).push({
                type: 'comment', userId: currentUser.uid, userName: currentUser.displayName || currentUser.name,
                postId: currentPostId, text: text, timestamp: Date.now(), read: false
            });
        }
    }
    document.getElementById('commentInput').value = '';
    await loadComments(currentPostId);
    refreshFeedCache();
    showToast('💬 تم إضافة التعليق');
}

// ==================== Profile ====================
async function openMyProfile() {
    if (currentUser) openProfile(currentUser.uid);
}

async function openProfile(userId) {
    currentProfileUser = userId;
    const snapshot = await db.ref(`users/${userId}`).once('value');
    const userData = snapshot.val();
    if (!userData) return;
    await recordProfileView(userId);
    const profileCover = document.getElementById('profileCover');
    if (profileCover) {
        if (userData.cover) {
            profileCover.style.backgroundImage = `url(${userData.cover})`;
            profileCover.style.backgroundSize = 'cover';
            profileCover.style.backgroundPosition = 'center';
        } else {
            profileCover.style.backgroundImage = 'linear-gradient(135deg, #667eea, #764ba2)';
        }
    }
    const profileAvatarLarge = document.getElementById('profileAvatarLarge');
    profileAvatarLarge.innerHTML = userData.avatar ? `<img src="${userData.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fa-solid fa-user text-5xl text-white flex items-center justify-center h-full"></i>';
    document.getElementById('profileName').innerHTML = `${escapeHtml(userData.name)} ${userData.verified ? '<i class="fa-solid fa-circle-check verified-badge" style="color: #3b82f6; font-size: 20px;"></i>' : ''}`;
    document.getElementById('profileBio').textContent = userData.bio || "مرحباً! أنا في ZORAK ✨";
    const websiteEl = document.getElementById('profileWebsite');
    if (userData.website) websiteEl.innerHTML = `<a href="${userData.website}" target="_blank" style="color: #667eea;">${userData.website}</a>`;
    else websiteEl.innerHTML = '';
    const followersSnapshot = await db.ref(`followers/${userId}`).once('value');
    const followingSnapshot = await db.ref(`following/${userId}`).once('value');
    const viewsSnapshot = await db.ref(`profileViews/${userId}`).once('value');
    document.getElementById('profileFollowersCount').textContent = followersSnapshot.exists() ? Object.keys(followersSnapshot.val()).length : 0;
    document.getElementById('profileFollowingCount').textContent = followingSnapshot.exists() ? Object.keys(followingSnapshot.val()).length : 0;
    document.getElementById('profileViewsCount').textContent = viewsSnapshot.exists() ? Object.keys(viewsSnapshot.val()).length : 0;
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    document.getElementById('profilePostsCount').textContent = posts ? Object.values(posts).filter(p => p.userId === userId).length : 0;
    const buttonsDiv = document.getElementById('profileButtons');
    if (userId !== currentUser.uid) {
        const isFollowing = await checkIfFollowing(userId);
        const isBlockedUser = await isBlocked(userId);
        const isMuted = await isUserMuted(userId);
        buttonsDiv.innerHTML = `<button class="profile-btn ${isFollowing ? '' : 'profile-btn-primary'}" onclick="toggleFollow('${userId}')">${isFollowing ? '✅ متابَع' : '➕ متابعة'}</button><button class="profile-btn" onclick="openChat('${userId}')"><i class="fa-regular fa-comment"></i> راسل</button><button class="profile-btn" onclick="startVideoCallWithUser('${userId}')"><i class="fa-solid fa-video"></i></button>${isBlockedUser ? `<button class="profile-btn" onclick="unblockUser('${userId}')">🔓 إلغاء الحظر</button>` : `<button class="profile-btn" onclick="blockUser('${userId}')">🚫 حظر</button>`}${currentUser.isAdmin ? `<button class="profile-btn" onclick="muteUser('${userId}', 60)">🔇 ${isMuted ? 'إلغاء التقييد' : 'تقييد'}</button>` : ''}`;
    } else {
        let adminButton = '';
        if (currentUser.isAdmin || currentUser.email === ADMIN_EMAIL) adminButton = `<button class="profile-btn profile-btn-primary" onclick="openAdminPanel()"><i class="fa-solid fa-screwdriver-wrench"></i> لوحة التحكم</button>`;
        buttonsDiv.innerHTML = `<button class="profile-btn" onclick="openEditProfileModal()"><i class="fa-regular fa-pen-to-square"></i> تعديل</button><button class="profile-btn" onclick="changeAvatar()"><i class="fa-solid fa-camera"></i> صورة</button><button class="profile-btn" onclick="changeCover()"><i class="fa-solid fa-image"></i> غلاف</button>${adminButton}`;
    }
    await loadProfilePosts(userId);
    document.getElementById('profilePanel').classList.add('open');
}

async function checkIfFollowing(userId) {
    const snapshot = await db.ref(`followers/${userId}/${currentUser.uid}`).once('value');
    return snapshot.exists();
}

async function toggleFollow(userId) {
    const isFollowing = await checkIfFollowing(userId);
    if (isFollowing) {
        await db.ref(`followers/${userId}/${currentUser.uid}`).remove();
        await db.ref(`following/${currentUser.uid}/${userId}`).remove();
        showToast('❌ تم إلغاء المتابعة');
    } else {
        await db.ref(`followers/${userId}/${currentUser.uid}`).set({ uid: currentUser.uid, name: currentUser.displayName || currentUser.name, timestamp: Date.now() });
        await db.ref(`following/${currentUser.uid}/${userId}`).set({ uid: userId, timestamp: Date.now() });
        showToast('✅ تم المتابعة');
        const dndSnapshot = await db.ref(`users/${userId}/dnd`).once('value');
        if (!dndSnapshot.val()) {
            await db.ref(`notifications/${userId}`).push({ type: 'follow', userId: currentUser.uid, userName: currentUser.displayName || currentUser.name, timestamp: Date.now(), read: false });
        }
    }
    openProfile(userId);
}

async function loadProfilePosts(userId) {
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    const userPosts = posts ? Object.values(posts).filter(p => p.userId === userId).sort((a, b) => b.timestamp - a.timestamp) : [];
    const grid = document.getElementById('profilePostsGrid');
    if (!grid) return;
    if (userPosts.length === 0) {
        grid.innerHTML = '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">📭 لا توجد منشورات</div>';
        return;
    }
    let html = '';
    for (const post of userPosts) {
        html += `<div class="grid-item" onclick="openComments('${post.id}')">${post.mediaUrl ? (post.mediaType === 'image' ? `<img src="${post.mediaUrl}">` : `<video src="${post.mediaUrl}"></video>`) : '<div class="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800"><i class="fa-regular fa-file-lines text-2xl text-gray-500"></i></div>'}<div class="grid-item-overlay"><span><i class="fa-regular fa-heart"></i> ${post.likes ? Object.keys(post.likes).length : 0}</span><span><i class="fa-regular fa-comment"></i> ${post.commentsCount || 0}</span></div></div>`;
    }
    grid.innerHTML = html;
}

async function loadProfileMedia(userId) {
    const postsSnapshot = await db.ref('posts').once('value');
    const posts = postsSnapshot.val();
    const userPosts = posts ? Object.values(posts).filter(p => p.userId === userId && p.mediaUrl).sort((a, b) => b.timestamp - a.timestamp) : [];
    const grid = document.getElementById('profilePostsGrid');
    if (!grid) return;
    if (userPosts.length === 0) {
        grid.innerHTML = '<div class="text-center p-8 text-gray-500" style="grid-column: span 3;">🎬 لا توجد وسائط</div>';
        return;
    }
    let html = '';
    for (const post of userPosts) {
        html += `<div class="grid-item" onclick="openComments('${post.id}')">${post.mediaType === 'image' ? `<img src="${post.mediaUrl}">` : `<video src="${post.mediaUrl}"></video>`}</div>`;
    }
    grid.innerHTML = html;
}

function openEditProfileModal() {
    document.getElementById('editName').value = currentUser.displayName || currentUser.name || '';
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editWebsite').value = currentUser.website || '';
    document.getElementById('editProfileModal').classList.add('open');
}

function closeEditProfileModal() {
    document.getElementById('editProfileModal').classList.remove('open');
}

async function saveProfileEdit() {
    const newName = document.getElementById('editName')?.value;
    const newBio = document.getElementById('editBio')?.value;
    const newWebsite = document.getElementById('editWebsite')?.value;
    if (newName && newName.trim()) await currentUser.updateProfile({ displayName: newName.trim() });
    await db.ref(`users/${currentUser.uid}`).update({ name: newName || currentUser.name, bio: newBio || "", website: newWebsite || "" });
    currentUser.name = newName || currentUser.name;
    currentUser.bio = newBio || "";
    currentUser.website = newWebsite || "";
    currentUser.displayName = newName || currentUser.displayName;
    closeEditProfileModal();
    openProfile(currentUser.uid);
    showToast('💾 تم حفظ التغييرات');
}

// ==================== Chat ====================
async function openChat(userId) {
    const snapshot = await db.ref(`users/${userId}`).once('value');
    currentChatUser = snapshot.val();
    document.getElementById('chatUserName').textContent = currentChatUser.name;
    const chatAvatar = document.getElementById('chatAvatar');
    chatAvatar.innerHTML = currentChatUser.avatar ? `<img src="${currentChatUser.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>';
    const lastSeenSnapshot = await db.ref(`users/${userId}/lastSeen`).once('value');
    const lastSeen = lastSeenSnapshot.val();
    const lastSeenEl = document.getElementById('chatLastSeen');
    if (lastSeen) lastSeenEl.textContent = `🕒 آخر ظهور ${formatTime(lastSeen)}`;
    else lastSeenEl.textContent = '';
    const chatId = getChatId(currentUser.uid, userId);
    listenForTyping(chatId);
    await loadChatMessages(userId);
    document.getElementById('chatPanel').classList.add('open');
}

async function loadChatMessages(userId) {
    const chatId = getChatId(currentUser.uid, userId);
    db.ref(`chats/${chatId}`).off();
    db.ref(`chats/${chatId}`).on('value', (snapshot) => {
        const messages = snapshot.val();
        const container = document.getElementById('chatMessages');
        if (!container) return;
        if (!messages) {
            container.innerHTML = '<div class="text-center p-4 text-gray-500">💬 لا توجد رسائل بعد</div>';
            return;
        }
        let html = '';
        const messagesArray = Object.values(messages).sort((a, b) => a.timestamp - b.timestamp);
        for (const msg of messagesArray) {
            const isSent = msg.senderId === currentUser.uid;
            const isRead = msg.read;
            html += `<div class="chat-message ${isSent ? 'sent' : ''}"><div class="message-bubble ${isSent ? 'sent' : ''}">${msg.text ? escapeHtml(msg.text) : ''}${msg.imageUrl ? `<img src="${msg.imageUrl}" class="message-image" style="max-width: 200px; border-radius: 12px; margin-top: 8px; cursor: pointer;" onclick="openImageViewer(['${msg.imageUrl}'], 0)">` : ''}${msg.audioUrl ? `<audio controls class="audio-player" style="margin-top: 8px; height: 36px;" src="${msg.audioUrl}"></audio>` : ''}</div>${isSent ? `<div class="message-status" style="font-size: 10px; color: #9ca3af; margin-top: 4px;"><i class="fa-solid fa-check${isRead ? '-double' : ''}"></i></div>` : ''}</div>`;
        }
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
        for (const [msgId, msg] of Object.entries(messages)) {
            if (!msg.read && msg.senderId !== currentUser.uid) {
                db.ref(`chats/${chatId}/${msgId}/read`).set(true);
            }
        }
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    let text = input?.value;
    if (!text || !currentChatUser) return;
    if (containsBadWords(text)) return showToast('⚠️ الرسالة تحتوي على كلمات ممنوعة');
    text = filterBadWords(text);
    const chatId = getChatId(currentUser.uid, currentChatUser.uid);
    await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, text: text, timestamp: Date.now(), read: false });
    input.value = '';
    db.ref(`typing/${chatId}/${currentUser.uid}`).remove();
}

async function sendChatImage(input) {
    const file = input.files[0];
    if (file && currentChatUser) {
        const url = await uploadToCloudinary(file);
        if (url) {
            const chatId = getChatId(currentUser.uid, currentChatUser.uid);
            await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, imageUrl: url, timestamp: Date.now(), read: false });
        }
    }
    input.value = '';
}

// ==================== Conversations List ====================
async function openConversations() {
    const conversationsList = document.getElementById('conversationsList');
    conversationsList.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    const snapshot = await db.ref('chats').once('value');
    const chats = snapshot.val();
    if (!chats) {
        conversationsList.innerHTML = '<div class="text-center p-4 text-gray-500">💬 لا توجد محادثات</div>';
        document.getElementById('conversationsPanel')?.classList.add('open');
        return;
    }
    const conversations = [];
    for (const [chatId, messages] of Object.entries(chats)) {
        const [user1, user2] = chatId.split('_');
        const otherUserId = user1 === currentUser.uid ? user2 : user1;
        const userSnapshot = await db.ref(`users/${otherUserId}`).once('value');
        const userData = userSnapshot.val();
        const messagesArray = Object.values(messages);
        const lastMessage = messagesArray.sort((a, b) => b.timestamp - a.timestamp)[0];
        conversations.push({ userId: otherUserId, userData: userData, lastMessage: lastMessage, timestamp: lastMessage.timestamp });
    }
    conversations.sort((a, b) => b.timestamp - a.timestamp);
    let html = '';
    for (const conv of conversations) {
        let unreadCount = 0;
        const messagesSnapshot = await db.ref(`chats/${getChatId(currentUser.uid, conv.userId)}`).once('value');
        const messages = messagesSnapshot.val();
        if (messages) unreadCount = Object.values(messages).filter(m => !m.read && m.senderId !== currentUser.uid).length;
        html += `<div class="follower-item fade-in-left" onclick="closeConversations(); openChat('${conv.userId}')"><div class="post-avatar" style="width: 48px; height: 48px;">${conv.userData?.avatar ? `<img src="${conv.userData.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div><div style="flex: 1;"><div style="font-weight: 600;">${escapeHtml(conv.userData?.name || 'مستخدم')}</div><div style="font-size: 12px; color: #9ca3af;">${conv.lastMessage.text ? conv.lastMessage.text.substring(0, 30) : (conv.lastMessage.audioUrl ? '🎤 رسالة صوتية' : (conv.lastMessage.imageUrl ? '🖼️ صورة' : ''))}</div></div>${unreadCount > 0 ? `<div style="background: linear-gradient(135deg, #667eea, #764ba2); color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px;">${unreadCount}</div>` : ''}</div>`;
    }
    conversationsList.innerHTML = html;
    document.getElementById('conversationsPanel')?.classList.add('open');
}

// ==================== Notifications ====================
async function loadNotifications() {
    if (!currentUser) return;
    db.ref(`notifications/${currentUser.uid}`).on('value', (snapshot) => {
        const notifications = snapshot.val();
        const notifIcon = document.querySelector('.nav-item:nth-child(4) i');
        if (!notifIcon) return;
        const parent = notifIcon.parentElement;
        const existingBadge = parent.querySelector('.notification-badge');
        if (notifications) {
            const unread = Object.values(notifications).filter(n => !n.read).length;
            if (unread > 0) {
                if (!existingBadge) parent.innerHTML = '<i class="fa-regular fa-bell"></i><div class="notification-badge" style="position: absolute; top: -6px; right: -10px; background: #ef4444; color: white; font-size: 9px; border-radius: 50%; width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;">' + unread + '</div>';
                else existingBadge.textContent = unread;
            } else if (existingBadge) parent.innerHTML = '<i class="fa-regular fa-bell"></i>';
        } else if (existingBadge) parent.innerHTML = '<i class="fa-regular fa-bell"></i>';
    });
}

async function openNotifications() {
    const snapshot = await db.ref(`notifications/${currentUser.uid}`).once('value');
    const notifications = snapshot.val();
    const container = document.getElementById('notificationsList');
    if (!notifications) {
        container.innerHTML = '<div class="text-center p-4 text-gray-500">🔔 لا توجد إشعارات</div>';
        document.getElementById('notificationsPanel')?.classList.add('open');
        return;
    }
    let html = '';
    const sorted = Object.entries(notifications).sort((a, b) => b[1].timestamp - a[1].timestamp);
    for (const [id, notif] of sorted) {
        html += `<div class="follower-item fade-in-left" onclick="markNotificationRead('${id}'); ${notif.type === 'like' ? `openComments('${notif.postId}')` : notif.type === 'comment' ? `openComments('${notif.postId}')` : notif.type === 'call' ? `startVideoCallWithUser('${notif.userId}')` : `openProfile('${notif.userId}')`}"><div class="post-avatar" style="width: 44px; height: 44px; background: linear-gradient(135deg, #667eea, #764ba2);"><i class="fa-solid ${notif.type === 'like' ? 'fa-heart' : notif.type === 'comment' ? 'fa-comment' : notif.type === 'call' ? 'fa-video' : 'fa-user-plus'} text-white text-xl flex items-center justify-center h-full"></i></div><div style="flex: 1;"><div><span style="font-weight: 600;">${escapeHtml(notif.userName)}</span> ${notif.type === 'like' ? '❤️ أعجب بمنشورك' : notif.type === 'comment' ? `💬 علق على منشورك: ${notif.text?.substring(0, 50)}` : notif.type === 'call' ? '📹 أجرى مكالمة فيديو معك' : '➕ بدأ بمتابعتك'}</div><div style="font-size: 11px; color: #9ca3af;">${formatTime(notif.timestamp)}</div></div></div>`;
    }
    container.innerHTML = html;
    document.getElementById('notificationsPanel')?.classList.add('open');
    const updates = {};
    for (const id of Object.keys(notifications)) updates[`notifications/${currentUser.uid}/${id}/read`] = true;
    await db.ref().update(updates);
    loadNotifications();
}

async function markNotificationRead(notifId) {
    await db.ref(`notifications/${currentUser.uid}/${notifId}`).update({ read: true });
    loadNotifications();
}

// ==================== Admin Panel ====================
async function openAdminPanel() {
    if (currentUser.email !== ADMIN_EMAIL && !currentUser.isAdmin) return showToast('🚫 غير مصرح لك بالدخول إلى لوحة التحكم');
    showToast('🔧 جاري تحميل لوحة التحكم...');
    
    const badWordsSnapshot = await db.ref('badWords').once('value');
    const badWords = badWordsSnapshot.val();
    const badWordsContainer = document.getElementById('adminBadWordsList');
    if (badWordsContainer) {
        if (!badWords) {
            badWordsContainer.innerHTML = '<div class="text-center p-4 text-gray-500">📝 لا توجد كلمات ممنوعة - أضف كلمات جديدة</div>';
        } else {
            let html = '<div style="max-height: 300px; overflow-y: auto;">';
            for (const [id, word] of Object.entries(badWords)) {
                html += `<div class="admin-item fade-in-left">
                    <div><span style="font-weight: 600;">🚫 ${escapeHtml(word)}</span></div>
                    <button class="admin-delete-btn" onclick="removeBadWord('${id}', '${word}')">🗑️ حذف</button>
                </div>`;
            }
            html += '</div>';
            badWordsContainer.innerHTML = html;
        }
    }
    
    const usersSnapshot = await db.ref('users').once('value');
    const postsSnapshot = await db.ref('posts').once('value');
    const commentsSnapshot = await db.ref('comments').once('value');
    const usersCount = usersSnapshot.exists() ? Object.keys(usersSnapshot.val()).length : 0;
    const postsCount = postsSnapshot.exists() ? Object.keys(postsSnapshot.val()).length : 0;
    let commentsCount = 0;
    if (commentsSnapshot.exists()) for (const pc of Object.values(commentsSnapshot.val())) commentsCount += Object.keys(pc).length;
    document.getElementById('adminUsersCount').textContent = usersCount;
    document.getElementById('adminPostsCount').textContent = postsCount;
    document.getElementById('adminCommentsCount').textContent = commentsCount;
    
    let usersHtml = '';
    if (usersSnapshot.exists()) {
        for (const [uid, user] of Object.entries(usersSnapshot.val())) {
            if (uid !== currentUser.uid) {
                const isMuted = await isUserMuted(uid);
                usersHtml += `<div class="admin-item fade-in-left"><div><div class="admin-item-name" style="font-weight: 600;">${escapeHtml(user.name)}</div><div class="admin-item-email" style="font-size: 12px; color: #9ca3af;">${escapeHtml(user.email)}</div></div><div>${!user.verified ? `<button class="admin-verify-btn" onclick="verifyUser('${uid}')">✅ توثيق</button>` : '<span style="color: #10b981; font-size: 12px;">✅ موثق</span>'}<button class="admin-mute-btn" onclick="muteUser('${uid}', 60)">🔇 تقييد</button><button class="admin-delete-btn" onclick="deleteUser('${uid}')">🗑️ حذف</button></div></div>`;
            }
        }
    }
    document.getElementById('adminUsersList').innerHTML = usersHtml || '<div class="text-center p-4 text-gray-500">👥 لا يوجد مستخدمين</div>';
    
    let postsHtml = '';
    if (postsSnapshot.exists()) {
        for (const post of Object.values(postsSnapshot.val()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)) {
            postsHtml += `<div class="admin-item fade-in-left"><div><div class="admin-item-name" style="font-weight: 600;">${escapeHtml(post.userName)}</div><div class="admin-item-email" style="font-size: 12px; color: #9ca3af;">${escapeHtml(post.text?.substring(0, 50) || '')}</div></div><button class="admin-delete-btn" onclick="deletePost('${post.id}')">🗑️ حذف</button></div>`;
        }
    }
    document.getElementById('adminPostsList').innerHTML = postsHtml || '<div class="text-center p-4 text-gray-500">📭 لا توجد منشورات</div>';
    document.getElementById('adminPanel').classList.add('open');
}

async function verifyUser(userId) {
    await db.ref(`users/${userId}`).update({ verified: true });
    showToast('✅ تم توثيق المستخدم بنجاح');
    if (currentUser && currentUser.uid === userId) {
        currentUser.verified = true;
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        const userData = userSnapshot.val();
        currentUser = { ...currentUser, ...userData };
    }
    openAdminPanel();
    if (currentProfileUser === userId) openProfile(userId);
    refreshFeedCache();
}

async function deleteUser(userId) {
    if (confirm('⚠️ هل أنت متأكد من حذف هذا المستخدم نهائياً؟')) {
        await db.ref(`users/${userId}`).remove();
        showToast('🗑️ تم حذف المستخدم');
        openAdminPanel();
        refreshFeedCache();
    }
}

function closeAdmin() {
    document.getElementById('adminPanel').classList.remove('open');
}

// ==================== Followers List ====================
async function openFollowersList(type) {
    document.getElementById('followersTitle').textContent = type === 'followers' ? '👥 المتابعون' : '👤 المتابَعون';
    const refPath = type === 'followers' ? `followers/${currentProfileUser}` : `following/${currentProfileUser}`;
    const snapshot = await db.ref(refPath).once('value');
    const data = snapshot.val();
    const container = document.getElementById('followersList');
    if (!data) {
        container.innerHTML = '<div class="text-center p-4 text-gray-500">👥 لا يوجد ' + (type === 'followers' ? 'متابعون' : 'متابَعون') + '</div>';
        document.getElementById('followersPanel')?.classList.add('open');
        return;
    }
    let html = '';
    for (const [userId] of Object.entries(data)) {
        const userSnapshot = await db.ref(`users/${userId}`).once('value');
        const userData = userSnapshot.val();
        html += `<div class="follower-item fade-in-left" onclick="closeFollowers(); openProfile('${userId}')"><div class="post-avatar" style="width: 48px; height: 48px;">${userData?.avatar ? `<img src="${userData.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div><div><div style="font-weight: 600;">${escapeHtml(userData?.name || 'مستخدم')}</div><div style="font-size: 12px; color: #9ca3af;">${escapeHtml(userData?.bio?.substring(0, 50) || '')}</div></div></div>`;
    }
    container.innerHTML = html;
    document.getElementById('followersPanel')?.classList.add('open');
}

function closeFollowers() {
    document.getElementById('followersPanel').classList.remove('open');
}

// ==================== Stories ====================
async function openStories() {
    showToast('📸 القصص قريباً في ZORAK!');
}

// ==================== Close Functions ====================
function closeCompose() {
    document.getElementById('composeModal').classList.remove('open');
    document.getElementById('postText').value = '';
    removeSelectedMedia();
    document.getElementById('pollBuilder').style.display = 'none';
    selectedMediaFile = null;
    editingPostId = null;
    const dragDropArea = document.getElementById('dragDropArea');
    if (dragDropArea) dragDropArea.style.display = 'block';
}

function openCompose() {
    document.getElementById('composeModal').classList.add('open');
    setupDragAndDrop();
}

function closeComments() {
    document.getElementById('commentsPanel').classList.remove('open');
    currentPostId = null;
}

function closeProfile() {
    document.getElementById('profilePanel').classList.remove('open');
}

function closeChat() {
    document.getElementById('chatPanel').classList.remove('open');
    if (isRecording) stopVoiceRecording();
    if (currentChatUser) {
        const chatId = getChatId(currentUser.uid, currentChatUser.uid);
        db.ref(`chats/${chatId}`).off();
        db.ref(`typing/${chatId}`).off();
    }
    currentChatUser = null;
}

function closeConversations() {
    document.getElementById('conversationsPanel').classList.remove('open');
}

function closeNotifications() {
    document.getElementById('notificationsPanel').classList.remove('open');
}

function closeSearch() {
    document.getElementById('searchPanel').classList.remove('open');
    document.getElementById('searchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
}

function openSearch() {
    document.getElementById('searchPanel').classList.add('open');
}

function goToHome() {
    refreshFeedCache();
}

function switchTab(tab) {
    if (tab === 'home') {
        refreshFeedCache();
    }
}

// ==================== Last Seen Update ====================
setInterval(async () => {
    if (currentUser) await db.ref(`users/${currentUser.uid}/lastSeen`).set(Date.now());
}, 60000);

// ==================== Auth State Listener (معدل - توجيه إلى auth.html) ====================
const initLoader = document.getElementById('initLoader');

auth.onAuthStateChanged(async (user) => {
    if (initLoader) {
        setTimeout(() => {
            initLoader.style.opacity = '0';
            setTimeout(() => {
                if (initLoader) initLoader.style.display = 'none';
            }, 300);
        }, 500);
    }
    
    if (user) {
        currentUser = user;
        const snapshot = await db.ref(`users/${user.uid}`).once('value');
        if (snapshot.exists()) {
            currentUser = { ...currentUser, ...snapshot.val() };
        } else {
            await db.ref(`users/${user.uid}`).set({
                uid: user.uid, name: user.displayName || user.email.split('@')[0],
                email: user.email, bio: "مرحباً! أنا في ZORAK ✨", avatar: "", cover: "",
                website: "", verified: false, isAdmin: user.email === ADMIN_EMAIL,
                blockedUsers: {}, mutedUntil: 0, createdAt: Date.now()
            });
            currentUser.isAdmin = user.email === ADMIN_EMAIL;
        }
        document.getElementById('mainApp').style.display = 'block';
        
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') document.body.classList.add('dark-mode');
        const savedReadMode = localStorage.getItem('readMode');
        if (savedReadMode === 'true') {
            readModeActive = true;
            document.getElementById('readModeToggle')?.classList.add('active');
            document.body.classList.add('read-mode');
        }
        const savedHideLikes = localStorage.getItem('hideLikes');
        if (savedHideLikes === 'true') {
            hideLikesActive = true;
            document.getElementById('hideLikesToggle')?.classList.add('active');
        }
        
        await loadBadWordsList();
        resetInfiniteScroll();
        await loadFeed();
        loadNotifications();
        loadTrendingHashtags();
        loadDndStatus();
        checkScheduledPosts();
    } else {
        window.location.href = 'auth.html';
    }
});
