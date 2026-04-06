// ==================== LUME - Main Script ====================
let currentUser = null;
let currentChatUser = null;
let currentProfileUser = null;
let selectedMediaFile = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let typingTimeout = null;
let badWordsList = [];
let allPostsCache = [];
let currentDisplayCount = 0;
let isLoadingPosts = false;
let hasMorePosts = true;
const POSTS_PER_PAGE = 10;
let scrollListenerAdded = false;
let agoraClient = null;
let localTracks = { videoTrack: null, audioTrack: null };
let readModeActive = false;

// ==================== Helper Functions ====================
function showToast(msg, duration = 2500) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, duration);
}

function formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `${days} يوم`;
    if (hours > 0) return `${hours} ساعة`;
    if (minutes > 0) return `${minutes} دقيقة`;
    return `${seconds} ثانية`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function extractHashtags(text) {
    return (text.match(/#[\w\u0600-\u06FF]+/g) || []).map(t => t.substring(1));
}

function containsBadWords(text) {
    if (!text || badWordsList.length === 0) return false;
    const lowerText = text.toLowerCase();
    return badWordsList.some(word => lowerText.includes(word.toLowerCase()));
}

function filterBadWords(text) {
    if (!text || badWordsList.length === 0) return text;
    let filtered = text;
    badWordsList.forEach(word => {
        filtered = filtered.replace(new RegExp(word, 'gi'), '*'.repeat(word.length));
    });
    return filtered;
}

// ==================== Upload to Cloudinary ====================
function uploadToCloudinary(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', UPLOAD_PRESET);
        xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/upload`);
        xhr.upload.onprogress = (e) => { if (onProgress) onProgress(Math.round((e.loaded / e.total) * 100)); };
        xhr.onload = () => { if (xhr.status === 200) resolve(JSON.parse(xhr.responseText).secure_url); else reject(); };
        xhr.onerror = () => reject();
        xhr.send(formData);
    });
}

// ==================== Bad Words ====================
async function loadBadWords() {
    const snap = await db.ref('badWords').once('value');
    badWordsList = snap.val() ? Object.values(snap.val()) : [];
}

async function addBadWord(word) {
    if (!word.trim()) return;
    await db.ref('badWords').push().set(word.trim().toLowerCase());
    await loadBadWords();
    showToast(`✅ تمت إضافة: ${word}`);
    if (currentUser?.isAdmin) openAdminPanel();
}

function showAddBadWordModal() {
    const word = prompt('📝 أدخل الكلمة الممنوعة:');
    if (word) addBadWord(word);
}

// ==================== Voice Recording ====================
async function startVoiceRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const url = await uploadToCloudinary(blob);
            if (url && currentChatUser) {
                const chatId = [currentUser.uid, currentChatUser.uid].sort().join('_');
                await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, audioUrl: url, timestamp: Date.now(), read: false });
                showToast('🎤 تم إرسال الرسالة الصوتية');
            }
            stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        isRecording = true;
        document.getElementById('recordingIndicator').style.display = 'flex';
    } catch(e) { showToast('❌ لا يمكن الوصول للميكروفون'); }
}

function stopVoiceRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        document.getElementById('recordingIndicator').style.display = 'none';
    }
}

function toggleVoiceRecording() { isRecording ? stopVoiceRecording() : startVoiceRecording(); }

// ==================== Theme & Settings ====================
function toggleTheme() {
    document.body.classList.toggle('light-mode');
    localStorage.setItem('theme', document.body.classList.contains('light-mode') ? 'light' : 'dark');
    showToast(document.body.classList.contains('light-mode') ? '☀️ الوضع النهاري' : '🌙 الوضع الليلي');
}

function toggleReadMode() {
    readModeActive = !readModeActive;
    document.getElementById('readModeToggle').classList.toggle('active');
    if (readModeActive) {
        document.body.style.fontSize = '18px';
        document.body.style.lineHeight = '1.8';
    } else {
        document.body.style.fontSize = '';
        document.body.style.lineHeight = '';
    }
    localStorage.setItem('readMode', readModeActive);
    showToast(readModeActive ? '📖 وضع القراءة مفعل' : '📖 وضع القراءة معطل');
}

async function toggleDoNotDisturb() {
    const toggle = document.getElementById('dndToggle');
    const isDnd = toggle.classList.contains('active');
    if (isDnd) {
        toggle.classList.remove('active');
        await db.ref(`users/${currentUser.uid}/dnd`).set(false);
        showToast('🔔 تم تفعيل الإشعارات');
    } else {
        toggle.classList.add('active');
        await db.ref(`users/${currentUser.uid}/dnd`).set(true);
        showToast('🔕 تم تفعيل عدم الإزعاج');
    }
}

// ==================== Post Functions ====================
function addPollToCompose() {
    const builder = document.getElementById('pollBuilder');
    builder.style.display = builder.style.display === 'none' ? 'block' : 'none';
}

function addPollOption() {
    const container = document.getElementById('pollBuilder');
    const inputs = container.querySelectorAll('input');
    if (inputs.length < 6) {
        const newInput = document.createElement('input');
        newInput.type = 'text';
        newInput.placeholder = `خيار ${inputs.length + 1}`;
        newInput.style.cssText = 'width:100%;padding:12px;border-radius:40px;background:rgba(255,255,255,0.1);border:none;margin-bottom:4px;color:white';
        container.insertBefore(newInput, container.querySelector('button'));
    } else showToast('لا يمكن إضافة أكثر من 6 خيارات');
}

function previewMedia(input, type) {
    const file = input.files[0];
    if (file) {
        selectedMediaFile = file;
        const preview = document.getElementById('mediaPreview');
        const reader = new FileReader();
        reader.onload = e => {
            preview.innerHTML = `<div style="position:relative"><img src="${e.target.result}" style="max-height:200px;border-radius:20px;width:100%"><div onclick="removeSelectedMedia()" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;cursor:pointer"><i class="fa-solid fa-times"></i></div></div>`;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function removeSelectedMedia() {
    selectedMediaFile = null;
    document.getElementById('mediaPreview').style.display = 'none';
    document.getElementById('mediaPreview').innerHTML = '';
    document.getElementById('postImage').value = '';
    document.getElementById('postVideo').value = '';
}

async function createPost() {
    const text = filterBadWords(document.getElementById('postText')?.value || '');
    if (!text && !selectedMediaFile) return showToast('⚠️ الرجاء كتابة نص أو إضافة وسائط');
    
    const publishBtn = document.getElementById('publishBtn');
    const progressDiv = document.getElementById('uploadProgress');
    const progressFill = document.getElementById('progressFill');
    
    let mediaUrl = '', mediaType = '';
    if (selectedMediaFile) {
        progressDiv.style.display = 'block';
        publishBtn.disabled = true;
        publishBtn.innerHTML = '<div class="spinner" style="width:20px;height:20px;display:inline-block;margin-left:8px"></div> جاري الرفع...';
        try {
            mediaUrl = await uploadToCloudinary(selectedMediaFile, p => { progressFill.style.width = `${p}%`; });
            mediaType = selectedMediaFile.type.split('/')[0];
        } catch(e) { showToast('❌ فشل رفع الملف'); progressDiv.style.display = 'none'; publishBtn.disabled = false; publishBtn.innerHTML = '✨ نشر'; return; }
        progressDiv.style.display = 'none';
    }
    
    const hashtags = extractHashtags(text);
    const pollQuestion = document.getElementById('pollQuestion')?.value;
    let pollData = null;
    if (pollQuestion) {
        const options = Array.from(document.querySelectorAll('#pollBuilder input[type="text"]')).map(i => i.value).filter(v => v);
        if (options.length >= 2) pollData = { question: pollQuestion, options, votes: {}, totalVotes: 0 };
    }
    
    const postRef = db.ref('posts').push();
    await postRef.set({
        id: postRef.key, userId: currentUser.uid, userName: currentUser.displayName || currentUser.name,
        userAvatar: currentUser.avatar || '', text, mediaUrl, mediaType, hashtags,
        likes: {}, views: 0, commentsCount: 0, poll: pollData, timestamp: Date.now()
    });
    
    hashtags.forEach(tag => db.ref(`hashtags/${tag.toLowerCase()}/${postRef.key}`).set(true));
    
    document.getElementById('postText').value = '';
    removeSelectedMedia();
    document.getElementById('pollBuilder').style.display = 'none';
    document.getElementById('pollQuestion').value = '';
    selectedMediaFile = null;
    closeCompose();
    await refreshFeed();
    loadTrending();
    showToast('✨ تم النشر بنجاح!');
    publishBtn.disabled = false;
    publishBtn.innerHTML = '✨ نشر';
}

async function deletePost(postId) {
    if (!confirm('⚠️ هل أنت متأكد من حذف هذا المنشور؟')) return;
    const post = (await db.ref(`posts/${postId}`).once('value')).val();
    if (post.userId !== currentUser.uid && !currentUser.isAdmin) return showToast('❌ لا يمكنك حذف هذا المنشور');
    if (post.hashtags) post.hashtags.forEach(tag => db.ref(`hashtags/${tag.toLowerCase()}/${postId}`).remove());
    await db.ref(`posts/${postId}`).remove();
    await refreshFeed();
    loadTrending();
    showToast('🗑️ تم حذف المنشور');
}

async function likePost(postId) {
    const likeRef = db.ref(`posts/${postId}/likes/${currentUser.uid}`);
    const exists = (await likeRef.once('value')).exists();
    if (exists) await likeRef.remove();
    else {
        await likeRef.set(true);
        const post = (await db.ref(`posts/${postId}`).once('value')).val();
        if (post && post.userId !== currentUser.uid) {
            const dnd = (await db.ref(`users/${post.userId}/dnd`).once('value')).val();
            if (!dnd) await db.ref(`notifications/${post.userId}`).push({
                type: 'like', userId: currentUser.uid, userName: currentUser.displayName || currentUser.name,
                postId, timestamp: Date.now(), read: false
            });
        }
    }
    refreshFeed();
}

async function savePost(postId) {
    const saveRef = db.ref(`saved/${currentUser.uid}/${postId}`);
    if ((await saveRef.once('value')).exists()) { await saveRef.remove(); showToast('📌 تمت الإزالة'); }
    else { await saveRef.set(true); showToast('💾 تم الحفظ'); }
    refreshFeed();
}

// ==================== Comments ====================
async function openComments(postId) {
    currentPostId = postId;
    document.getElementById('commentsPanel').classList.add('open');
    await loadComments(postId);
}

async function loadComments(postId) {
    const comments = (await db.ref(`comments/${postId}`).once('value')).val();
    const container = document.getElementById('commentsList');
    if (!comments) { container.innerHTML = '<div class="text-center p-6 opacity-60">💬 لا توجد تعليقات</div>'; return; }
    let html = '';
    for (const [id, comment] of Object.entries(comments)) {
        const user = (await db.ref(`users/${comment.userId}`).once('value')).val();
        html += `<div class="chat-message"><div class="message-bubble"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-weight:700;cursor:pointer" onclick="openProfile('${comment.userId}')">${escapeHtml(user?.name || 'مستخدم')}</span><span style="font-size:10px;opacity:0.6">${formatTime(comment.timestamp)}</span></div><div>${escapeHtml(comment.text)}</div></div></div>`;
    }
    container.innerHTML = html;
}

async function addComment() {
    let text = document.getElementById('commentInput')?.value;
    if (!text || !currentPostId) return;
    if (containsBadWords(text)) return showToast('⚠️ التعليق يحتوي على كلمات ممنوعة');
    text = filterBadWords(text);
    const commentRef = db.ref(`comments/${currentPostId}`).push();
    await commentRef.set({ userId: currentUser.uid, text, timestamp: Date.now() });
    await db.ref(`posts/${currentPostId}/commentsCount`).transaction(c => (c || 0) + 1);
    document.getElementById('commentInput').value = '';
    await loadComments(currentPostId);
    refreshFeed();
    showToast('💬 تم إضافة التعليق');
}

// ==================== Profile ====================
async function openMyProfile() { if (currentUser) openProfile(currentUser.uid); }

async function openProfile(userId) {
    currentProfileUser = userId;
    const userData = (await db.ref(`users/${userId}`).once('value')).val();
    if (!userData) return;
    
    document.getElementById('profileCover').style.backgroundImage = userData.cover ? `url(${userData.cover})` : 'linear-gradient(135deg, #7c3aed, #c084fc)';
    document.getElementById('profileAvatarLarge').innerHTML = userData.avatar ? `<img src="${userData.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fa-solid fa-user text-5xl text-white flex items-center justify-center h-full"></i>';
    document.getElementById('profileName').innerHTML = `${escapeHtml(userData.name)} ${userData.verified ? '<i class="fa-solid fa-circle-check" style="color:#7c3aed"></i>' : ''}`;
    document.getElementById('profileBio').textContent = userData.bio || "مرحباً! أنا في LUME ✨";
    document.getElementById('profileWebsite').innerHTML = userData.website ? `<a href="${userData.website}" target="_blank" style="color:#7c3aed">🔗 ${userData.website}</a>` : '';
    
    const followers = (await db.ref(`followers/${userId}`).once('value')).val();
    const following = (await db.ref(`following/${userId}`).once('value')).val();
    document.getElementById('profileFollowersCount').textContent = followers ? Object.keys(followers).length : 0;
    document.getElementById('profileFollowingCount').textContent = following ? Object.keys(following).length : 0;
    
    const posts = (await db.ref('posts').once('value')).val();
    document.getElementById('profilePostsCount').textContent = posts ? Object.values(posts).filter(p => p.userId === userId).length : 0;
    
    const buttons = document.getElementById('profileButtons');
    if (userId !== currentUser.uid) {
        const isFollowing = (await db.ref(`followers/${userId}/${currentUser.uid}`).once('value')).exists();
        buttons.innerHTML = `<button class="profile-btn ${isFollowing ? '' : 'profile-btn-primary'}" onclick="toggleFollow('${userId}')">${isFollowing ? '✅ متابَع' : '➕ متابعة'}</button>
                            <button class="profile-btn" onclick="openChat('${userId}')"><i class="fa-regular fa-comment"></i> راسل</button>
                            <button class="profile-btn" onclick="blockUser('${userId}')">🚫 حظر</button>
                            ${currentUser.isAdmin ? `<button class="profile-btn" onclick="verifyUser('${userId}')">✅ توثيق</button>` : ''}`;
    } else {
        buttons.innerHTML = `<button class="profile-btn" onclick="openEditProfileModal()"><i class="fa-regular fa-pen-to-square"></i> تعديل</button>
                            <button class="profile-btn" onclick="changeAvatar()"><i class="fa-solid fa-camera"></i> صورة</button>
                            <button class="profile-btn" onclick="changeCover()"><i class="fa-solid fa-image"></i> غلاف</button>
                            ${currentUser.isAdmin ? `<button class="profile-btn profile-btn-primary" onclick="openAdminPanel()"><i class="fa-solid fa-screwdriver-wrench"></i> لوحة التحكم</button>` : ''}`;
    }
    await loadProfilePosts(userId);
    document.getElementById('profilePanel').classList.add('open');
}

async function toggleFollow(userId) {
    const isFollowing = (await db.ref(`followers/${userId}/${currentUser.uid}`).once('value')).exists();
    if (isFollowing) {
        await db.ref(`followers/${userId}/${currentUser.uid}`).remove();
        await db.ref(`following/${currentUser.uid}/${userId}`).remove();
        showToast('❌ تم إلغاء المتابعة');
    } else {
        await db.ref(`followers/${userId}/${currentUser.uid}`).set({ uid: currentUser.uid, name: currentUser.displayName, timestamp: Date.now() });
        await db.ref(`following/${currentUser.uid}/${userId}`).set({ uid: userId, timestamp: Date.now() });
        showToast('✅ تم المتابعة');
        const dnd = (await db.ref(`users/${userId}/dnd`).once('value')).val();
        if (!dnd) await db.ref(`notifications/${userId}`).push({ type: 'follow', userId: currentUser.uid, userName: currentUser.displayName, timestamp: Date.now(), read: false });
    }
    openProfile(userId);
}

async function loadProfilePosts(userId) {
    const posts = (await db.ref('posts').once('value')).val();
    const userPosts = posts ? Object.values(posts).filter(p => p.userId === userId).sort((a,b) => b.timestamp - a.timestamp) : [];
    const grid = document.getElementById('profilePostsGrid');
    if (userPosts.length === 0) { grid.innerHTML = '<div class="text-center p-10 opacity-60" style="grid-column:span 3">📭 لا توجد منشورات</div>'; return; }
    let html = '';
    for (const post of userPosts) {
        html += `<div class="grid-item" onclick="openComments('${post.id}')" style="aspect-ratio:1;overflow:hidden;cursor:pointer">
                    ${post.mediaUrl ? (post.mediaType === 'image' ? `<img src="${post.mediaUrl}" style="width:100%;height:100%;object-fit:cover">` : `<video src="${post.mediaUrl}" style="width:100%;height:100%;object-fit:cover"></video>`) : '<div style="height:100%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center"><i class="fa-regular fa-file-lines text-3xl opacity-40"></i></div>'}
                    <div class="grid-item-overlay" style="position:absolute;bottom:0;left:0;right:0;background:linear-gradient(to top,black,transparent);padding:4px;display:flex;justify-content:center;gap:16px;font-size:11px"><span><i class="fa-regular fa-heart"></i> ${post.likes ? Object.keys(post.likes).length : 0}</span><span><i class="fa-regular fa-comment"></i> ${post.commentsCount || 0}</span></div>
                </div>`;
    }
    grid.innerHTML = html;
}

async function changeAvatar() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (file) {
            showToast('🔄 جاري الرفع...');
            const url = await uploadToCloudinary(file);
            await db.ref(`users/${currentUser.uid}`).update({ avatar: url });
            currentUser.avatar = url;
            openProfile(currentUser.uid);
            showToast('✅ تم تغيير الصورة');
        }
    };
    input.click();
}

async function changeCover() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (file) {
            showToast('🔄 جاري الرفع...');
            const url = await uploadToCloudinary(file);
            await db.ref(`users/${currentUser.uid}`).update({ cover: url });
            currentUser.cover = url;
            openProfile(currentUser.uid);
            showToast('✅ تم تغيير الغلاف');
        }
    };
    input.click();
}

function openEditProfileModal() {
    document.getElementById('editName').value = currentUser.displayName || currentUser.name;
    document.getElementById('editBio').value = currentUser.bio || '';
    document.getElementById('editWebsite').value = currentUser.website || '';
    document.getElementById('editProfileModal').classList.add('open');
}

function closeEditProfileModal() { document.getElementById('editProfileModal').classList.remove('open'); }

async function saveProfileEdit() {
    const name = document.getElementById('editName').value;
    const bio = document.getElementById('editBio').value;
    const website = document.getElementById('editWebsite').value;
    if (name) await currentUser.updateProfile({ displayName: name });
    await db.ref(`users/${currentUser.uid}`).update({ name, bio, website });
    currentUser.name = name;
    currentUser.bio = bio;
    currentUser.website = website;
    closeEditProfileModal();
    openProfile(currentUser.uid);
    showToast('💾 تم حفظ التغييرات');
}

async function blockUser(userId) {
    await db.ref(`users/${currentUser.uid}/blocked/${userId}`).set(true);
    showToast('🚫 تم حظر المستخدم');
    refreshFeed();
}

// ==================== Chat ====================
function getChatId(u1, u2) { return [u1, u2].sort().join('_'); }

async function openChat(userId) {
    const userData = (await db.ref(`users/${userId}`).once('value')).val();
    currentChatUser = { uid: userId, ...userData };
    document.getElementById('chatUserName').textContent = userData.name;
    document.getElementById('chatAvatar').innerHTML = userData.avatar ? `<img src="${userData.avatar}" style="width:100%;height:100%;object-fit:cover">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>';
    const chatId = getChatId(currentUser.uid, userId);
    listenForTyping(chatId);
    loadChatMessages(userId);
    document.getElementById('chatPanel').classList.add('open');
}

function listenForTyping(chatId) {
    db.ref(`typing/${chatId}`).on('value', snap => {
        const typing = snap.val();
        document.getElementById('typingIndicator').style.display = (typing && Object.keys(typing).length > 0 && !typing[currentUser.uid]) ? 'block' : 'none';
    });
}

function onTyping() {
    if (!currentChatUser) return;
    const chatId = getChatId(currentUser.uid, currentChatUser.uid);
    db.ref(`typing/${chatId}/${currentUser.uid}`).set(true);
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => db.ref(`typing/${chatId}/${currentUser.uid}`).remove(), 1000);
}

function loadChatMessages(userId) {
    const chatId = getChatId(currentUser.uid, userId);
    db.ref(`chats/${chatId}`).off();
    db.ref(`chats/${chatId}`).on('value', snap => {
        const messages = snap.val();
        const container = document.getElementById('chatMessages');
        if (!messages) { container.innerHTML = '<div class="text-center p-6 opacity-60">💬 لا توجد رسائل بعد</div>'; return; }
        let html = '';
        Object.values(messages).sort((a,b) => a.timestamp - b.timestamp).forEach(msg => {
            const isSent = msg.senderId === currentUser.uid;
            html += `<div style="display:flex;justify-content:${isSent ? 'flex-end' : 'flex-start'};margin-bottom:12px">
                        <div class="message-bubble ${isSent ? 'sent' : ''}">
                            ${msg.text ? escapeHtml(msg.text) : ''}
                            ${msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width:200px;border-radius:16px;margin-top:8px;cursor:pointer" onclick="window.open('${msg.imageUrl}')">` : ''}
                            ${msg.audioUrl ? `<audio controls src="${msg.audioUrl}" style="height:36px;margin-top:8px"></audio>` : ''}
                        </div>
                    </div>`;
        });
        container.innerHTML = html;
        container.scrollTop = container.scrollHeight;
        Object.entries(messages).forEach(([id, msg]) => { if (!msg.read && msg.senderId !== currentUser.uid) db.ref(`chats/${chatId}/${id}/read`).set(true); });
    });
}

async function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    let text = input?.value;
    if (!text || !currentChatUser) return;
    if (containsBadWords(text)) return showToast('⚠️ الرسالة تحتوي على كلمات ممنوعة');
    text = filterBadWords(text);
    const chatId = getChatId(currentUser.uid, currentChatUser.uid);
    await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, text, timestamp: Date.now(), read: false });
    input.value = '';
    db.ref(`typing/${chatId}/${currentUser.uid}`).remove();
}

async function sendChatImage(input) {
    const file = input.files[0];
    if (file && currentChatUser) {
        showToast('🔄 جاري الرفع...');
        const url = await uploadToCloudinary(file);
        const chatId = getChatId(currentUser.uid, currentChatUser.uid);
        await db.ref(`chats/${chatId}`).push({ senderId: currentUser.uid, imageUrl: url, timestamp: Date.now(), read: false });
        showToast('✅ تم إرسال الصورة');
    }
    input.value = '';
}

async function openConversations() {
    const chats = (await db.ref('chats').once('value')).val();
    const container = document.getElementById('conversationsList');
    if (!chats) { container.innerHTML = '<div class="text-center p-6 opacity-60">💬 لا توجد محادثات</div>'; document.getElementById('conversationsPanel').classList.add('open'); return; }
    const convs = [];
    for (const [chatId, msgs] of Object.entries(chats)) {
        const [u1, u2] = chatId.split('_');
        const otherId = u1 === currentUser.uid ? u2 : u1;
        const user = (await db.ref(`users/${otherId}`).once('value')).val();
        const lastMsg = Object.values(msgs).sort((a,b) => b.timestamp - a.timestamp)[0];
        convs.push({ userId: otherId, user, lastMsg, timestamp: lastMsg.timestamp });
    }
    convs.sort((a,b) => b.timestamp - a.timestamp);
    let html = '';
    for (const c of convs) {
        const unread = Object.values((await db.ref(`chats/${getChatId(currentUser.uid, c.userId)}`).once('value')).val() || {}).filter(m => !m.read && m.senderId !== currentUser.uid).length;
        html += `<div class="follower-item" onclick="closeConversations(); openChat('${c.userId}')" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)">
                    <div class="post-avatar" style="width:48px;height:48px">${c.user?.avatar ? `<img src="${c.user.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
                    <div style="flex:1"><div style="font-weight:700">${escapeHtml(c.user?.name || 'مستخدم')}</div><div style="font-size:12px;opacity:0.6">${c.lastMsg.text ? c.lastMsg.text.substring(0,30) : (c.lastMsg.audioUrl ? '🎤 رسالة صوتية' : (c.lastMsg.imageUrl ? '🖼️ صورة' : ''))}</div></div>
                    ${unread > 0 ? `<div style="background:#7c3aed;border-radius:50%;width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:11px">${unread}</div>` : ''}
                </div>`;
    }
    container.innerHTML = html;
    document.getElementById('conversationsPanel').classList.add('open');
}

// ==================== Notifications ====================
async function openNotifications() {
    const notifs = (await db.ref(`notifications/${currentUser.uid}`).once('value')).val();
    const container = document.getElementById('notificationsList');
    if (!notifs) { container.innerHTML = '<div class="text-center p-6 opacity-60">🔔 لا توجد إشعارات</div>'; document.getElementById('notificationsPanel').classList.add('open'); return; }
    let html = '';
    Object.entries(notifs).sort((a,b) => b[1].timestamp - a[1].timestamp).forEach(([id, n]) => {
        html += `<div class="follower-item" onclick="markNotifRead('${id}'); ${n.type === 'like' ? `openComments('${n.postId}')` : `openProfile('${n.userId}')`}" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)">
                    <div class="post-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,#7c3aed,#c084fc);display:flex;align-items:center;justify-content:center"><i class="fa-solid ${n.type === 'like' ? 'fa-heart' : 'fa-user-plus'} text-white"></i></div>
                    <div><div><span style="font-weight:700">${escapeHtml(n.userName)}</span> ${n.type === 'like' ? 'أعجب بمنشورك' : 'بدأ بمتابعتك'}</div><div style="font-size:11px;opacity:0.6">${formatTime(n.timestamp)}</div></div>
                </div>`;
    });
    container.innerHTML = html;
    document.getElementById('notificationsPanel').classList.add('open');
    const updates = {};
    Object.keys(notifs).forEach(id => updates[`notifications/${currentUser.uid}/${id}/read`] = true);
    await db.ref().update(updates);
}

async function markNotifRead(id) { await db.ref(`notifications/${currentUser.uid}/${id}/read`).set(true); }

// ==================== Admin Panel ====================
async function openAdminPanel() {
    if (currentUser.email !== ADMIN_EMAIL && !currentUser.isAdmin) return showToast('🚫 غير مصرح');
    showToast('🔧 جاري التحميل...');
    
    const users = (await db.ref('users').once('value')).val();
    const posts = (await db.ref('posts').once('value')).val();
    let commentsCount = 0;
    const comments = (await db.ref('comments').once('value')).val();
    if (comments) Object.values(comments).forEach(c => commentsCount += Object.keys(c).length);
    
    document.getElementById('adminUsersCount').textContent = users ? Object.keys(users).length : 0;
    document.getElementById('adminPostsCount').textContent = posts ? Object.keys(posts).length : 0;
    document.getElementById('adminCommentsCount').textContent = commentsCount;
    
    const badWords = (await db.ref('badWords').once('value')).val();
    const bwContainer = document.getElementById('adminBadWordsList');
    if (badWords) {
        let html = '';
        Object.entries(badWords).forEach(([id, w]) => { html += `<div class="admin-item" style="display:flex;justify-content:space-between;padding:12px;border-bottom:1px solid rgba(255,255,255,0.05)"><span>🚫 ${w}</span><button class="admin-delete-btn" onclick="removeBadWord('${id}','${w}')" style="background:#ef4444;border:none;padding:4px 12px;border-radius:40px;color:white;cursor:pointer">حذف</button></div>`; });
        bwContainer.innerHTML = html;
    } else bwContainer.innerHTML = '<div class="text-center p-4 opacity-60">لا توجد كلمات ممنوعة</div>';
    
    let usersHtml = '';
    if (users) Object.entries(users).forEach(([uid, u]) => {
        if (uid !== currentUser.uid) usersHtml += `<div class="admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.05)"><div><div style="font-weight:700">${escapeHtml(u.name)}</div><div style="font-size:12px;opacity:0.6">${escapeHtml(u.email)}</div></div><div>${!u.verified ? `<button class="admin-verify-btn" onclick="verifyUser('${uid}')" style="background:#10b981;border:none;padding:6px 12px;border-radius:40px;color:white;cursor:pointer;margin-left:8px">✅ توثيق</button>` : '<span style="color:#10b981">موثق ✓</span>'}<button class="admin-delete-btn" onclick="deleteUser('${uid}')" style="background:#ef4444;border:none;padding:6px 12px;border-radius:40px;color:white;cursor:pointer">🗑️ حذف</button></div></div>`;
    });
    document.getElementById('adminUsersList').innerHTML = usersHtml || '<div class="text-center p-4 opacity-60">لا يوجد مستخدمين</div>';
    
    let postsHtml = '';
    if (posts) Object.values(posts).sort((a,b) => b.timestamp - a.timestamp).slice(0,10).forEach(p => {
        postsHtml += `<div class="admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,0.05)"><div><div style="font-weight:700">${escapeHtml(p.userName)}</div><div style="font-size:12px;opacity:0.6">${escapeHtml(p.text?.substring(0,50) || '')}</div></div><button class="admin-delete-btn" onclick="deletePost('${p.id}')" style="background:#ef4444;border:none;padding:6px 12px;border-radius:40px;color:white;cursor:pointer">🗑️ حذف</button></div>`;
    });
    document.getElementById('adminPostsList').innerHTML = postsHtml || '<div class="text-center p-4 opacity-60">لا توجد منشورات</div>';
    document.getElementById('adminPanel').classList.add('open');
}

async function verifyUser(userId) {
    await db.ref(`users/${userId}`).update({ verified: true });
    showToast('✅ تم توثيق المستخدم');
    if (currentProfileUser === userId) openProfile(userId);
    openAdminPanel();
    refreshFeed();
}

async function deleteUser(userId) {
    if (confirm('⚠️ حذف المستخدم نهائياً؟')) {
        await db.ref(`users/${userId}`).remove();
        showToast('🗑️ تم حذف المستخدم');
        openAdminPanel();
        refreshFeed();
    }
}

async function removeBadWord(id, word) {
    await db.ref(`badWords/${id}`).remove();
    await loadBadWords();
    showToast(`✅ تم حذف: ${word}`);
    openAdminPanel();
}

// ==================== Search ====================
async function searchAll() {
    const query = document.getElementById('searchInput')?.value.toLowerCase();
    if (!query) return;
    const users = (await db.ref('users').once('value')).val();
    const hashtags = (await db.ref('hashtags').once('value')).val();
    let results = [];
    if (users) Object.values(users).forEach(u => { if (u.name?.toLowerCase().includes(query)) results.push({ type: 'user', data: u }); });
    if (hashtags && query.startsWith('#')) {
        const tag = query.substring(1);
        if (hashtags[tag]) results.push({ type: 'hashtag', data: { tag, count: Object.keys(hashtags[tag]).length } });
    } else if (hashtags) Object.keys(hashtags).forEach(tag => { if (tag.includes(query)) results.push({ type: 'hashtag', data: { tag, count: Object.keys(hashtags[tag]).length } }); });
    const container = document.getElementById('searchResults');
    if (!container) return;
    if (results.length === 0) { container.innerHTML = '<div class="text-center p-6 opacity-60">🔍 لا توجد نتائج</div>'; return; }
    let html = '';
    results.forEach(r => {
        if (r.type === 'user') html += `<div class="follower-item" onclick="openProfile('${r.data.uid}')" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)"><div class="post-avatar" style="width:44px;height:44px">${r.data.avatar ? `<img src="${r.data.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div><div><div style="font-weight:700">${escapeHtml(r.data.name)}</div><div style="font-size:12px;opacity:0.6">${escapeHtml(r.data.email)}</div></div></div>`;
        else html += `<div class="follower-item" onclick="searchHashtag('${r.data.tag}')" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)"><div class="post-avatar" style="width:44px;height:44px;background:linear-gradient(135deg,#7c3aed,#c084fc);display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-hashtag text-white text-xl"></i></div><div><div style="font-weight:700;color:#7c3aed">#${escapeHtml(r.data.tag)}</div><div style="font-size:12px;opacity:0.6">${r.data.count} منشور</div></div></div>`;
    });
    container.innerHTML = html;
}

function searchHashtag(tag) { window.location.href = `?hashtag=${tag}`; refreshFeed(); }

// ==================== Feed & Infinite Scroll ====================
async function loadTrending() {
    const hashtags = (await db.ref('hashtags').once('value')).val();
    if (!hashtags) return;
    const trending = Object.entries(hashtags).map(([tag, posts]) => ({ tag, count: Object.keys(posts).length })).sort((a,b) => b.count - a.count).slice(0,5);
    const container = document.getElementById('trendingList');
    if (container) container.innerHTML = trending.map((t,i) => `<div class="trending-item" onclick="searchHashtag('${t.tag}')" style="padding:12px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;border-radius:16px"><div style="display:flex;justify-content:space-between"><div><div style="font-size:11px;color:#7c3aed">#${i+1}</div><div style="font-weight:700">#${escapeHtml(t.tag)}</div></div><div style="font-size:12px;opacity:0.6">${t.count}</div></div></div>`).join('');
}

async function refreshFeed() {
    if (!currentUser) return;
    const posts = (await db.ref('posts').once('value')).val();
    if (!posts) { document.getElementById('feedContainer').innerHTML = '<div class="text-center p-10 opacity-60">✨ لا توجد منشورات بعد - كن أول من ينشر!</div>'; return; }
    let postsArray = Object.values(posts).sort((a,b) => b.timestamp - a.timestamp);
    const blocked = (await db.ref(`users/${currentUser.uid}/blocked`).once('value')).val() || {};
    postsArray = postsArray.filter(p => !blocked[p.userId]);
    allPostsCache = postsArray;
    hasMorePosts = allPostsCache.length > POSTS_PER_PAGE;
    currentDisplayCount = POSTS_PER_PAGE;
    const container = document.getElementById('feedContainer');
    container.innerHTML = '';
    await displayPosts(0, POSTS_PER_PAGE);
    if (!scrollListenerAdded) { setupScroll(); scrollListenerAdded = true; }
}

async function displayPosts(start, count) {
    const container = document.getElementById('feedContainer');
    const end = Math.min(start + count, allPostsCache.length);
    for (let i = start; i < end; i++) {
        const post = allPostsCache[i];
        const user = (await db.ref(`users/${post.userId}`).once('value')).val();
        const isLiked = post.likes && post.likes[currentUser?.uid];
        const likesCount = post.likes ? Object.keys(post.likes).length : 0;
        let formattedText = escapeHtml(post.text);
        if (post.hashtags) post.hashtags.forEach(tag => { formattedText = formattedText.replace(new RegExp(`#${tag}`, 'gi'), `<span class="post-hashtags" onclick="searchHashtag('${tag}')" style="color:#7c3aed;cursor:pointer">#${tag}</span>`); });
        let pollHtml = '';
        if (post.poll && post.poll.question) {
            pollHtml = `<div class="poll-container" style="background:rgba(255,255,255,0.05);border-radius:20px;padding:16px;margin:8px 16px">
                        <div style="font-weight:700;margin-bottom:12px">📊 ${escapeHtml(post.poll.question)}</div>`;
            for (let o = 0; o < post.poll.options.length; o++) {
                const votes = post.poll.votes ? Object.values(post.poll.votes).filter(v => v === o).length : 0;
                const percent = post.poll.totalVotes > 0 ? (votes / post.poll.totalVotes * 100).toFixed(1) : 0;
                pollHtml += `<div class="poll-option" onclick="votePoll('${post.id}',${o})" style="background:rgba(255,255,255,0.08);border-radius:16px;padding:12px;margin:8px 0;cursor:pointer;position:relative;overflow:hidden">
                            <div class="poll-progress" style="position:absolute;left:0;top:0;height:100%;width:${percent}%;background:rgba(124,58,237,0.3);transition:width 0.3s"></div>
                            <div class="poll-option-text" style="position:relative;z-index:1;display:flex;justify-content:space-between"><span>${escapeHtml(post.poll.options[o])}</span><span>${percent}% (${votes})</span></div>
                        </div>`;
            }
            pollHtml += `<div style="font-size:11px;opacity:0.6;margin-top:8px">${post.poll.totalVotes || 0} صوت</div></div>`;
        }
        const postHtml = `<div class="post-card glass-card" data-post-id="${post.id}" ondblclick="likePost('${post.id}')" style="margin-bottom:20px;cursor:pointer">
            <div class="post-header" style="display:flex;justify-content:space-between;padding:16px 20px">
                <div style="display:flex;align-items:center;gap:12px;cursor:pointer" onclick="openProfile('${post.userId}')">
                    <div class="post-avatar" style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#c084fc);display:flex;align-items:center;justify-content:center;overflow:hidden">${post.userAvatar ? `<img src="${post.userAvatar}">` : '<i class="fa-solid fa-user text-white text-xl"></i>'}</div>
                    <div><div class="post-username" style="font-weight:800;display:flex;align-items:center;gap:6px">${escapeHtml(post.userName)} ${user?.verified ? '<i class="fa-solid fa-circle-check" style="color:#7c3aed;font-size:14px"></i>' : ''}</div><div class="post-time" style="font-size:11px;opacity:0.6">${formatTime(post.timestamp)}</div></div>
                </div>
                <div style="display:flex;gap:12px">
                    ${post.userId === currentUser.uid ? `<button class="post-menu" onclick="event.stopPropagation();deletePost('${post.id}')" style="background:none;border:none;font-size:18px;cursor:pointer;color:rgba(255,255,255,0.5)"><i class="fa-regular fa-trash-can"></i></button>` : ''}
                    <button class="post-menu" onclick="event.stopPropagation();savePost('${post.id}')" style="background:none;border:none;font-size:18px;cursor:pointer;color:rgba(255,255,255,0.5)"><i class="fa-regular fa-bookmark"></i></button>
                </div>
            </div>
            ${post.mediaUrl ? (post.mediaType === 'image' ? `<img src="${post.mediaUrl}" class="post-image" style="width:calc(100% - 32px);max-height:450px;object-fit:cover;border-radius:20px;margin:8px 16px;cursor:pointer" onclick="event.stopPropagation();window.open('${post.mediaUrl}','_blank')">` : `<video src="${post.mediaUrl}" controls style="width:calc(100% - 32px);max-height:450px;border-radius:20px;margin:8px 16px"></video>`) : ''}
            ${pollHtml}
            <div class="post-caption" style="padding:0 20px 12px;font-size:15px"><span style="font-weight:800;cursor:pointer;color:#7c3aed" onclick="openProfile('${post.userId}')">${escapeHtml(post.userName)}</span> ${formattedText}</div>
            <div class="post-actions" style="display:flex;gap:28px;padding:8px 20px">
                <button class="post-action ${isLiked ? 'active' : ''}" onclick="likePost('${post.id}')" style="background:none;border:none;font-size:24px;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fa-regular fa-heart"></i> <span>${likesCount || ''}</span></button>
                <button class="post-action" onclick="openComments('${post.id}')" style="background:none;border:none;font-size:24px;cursor:pointer;display:flex;align-items:center;gap:6px"><i class="fa-regular fa-comment"></i> <span>${post.commentsCount || 0}</span></button>
                <button class="post-action" onclick="sharePost('${post.id}')" style="background:none;border:none;font-size:24px;cursor:pointer"><i class="fa-regular fa-paper-plane"></i></button>
            </div>
            <div class="post-views" style="padding:0 20px 16px;font-size:11px;opacity:0.4"><i class="fa-regular fa-eye"></i> ${post.views || 0} مشاهدة</div>
        </div>`;
        container.insertAdjacentHTML('beforeend', postHtml);
    }
    if (hasMorePosts && end < allPostsCache.length) { if (!document.getElementById('loadMore')) { const loadMore = document.createElement('div'); loadMore.id = 'loadMore'; loadMore.className = 'load-more-btn'; loadMore.innerHTML = '<div class="spinner" style="width:28px;height:28px"></div>'; loadMore.style.display = 'none'; container.appendChild(loadMore); } }
    else if (end >= allPostsCache.length && allPostsCache.length > 0) { const msg = document.createElement('div'); msg.className = 'text-center p-6 opacity-60'; msg.innerHTML = '✨ لقد وصلت إلى النهاية ✨'; container.appendChild(msg); }
}

function setupScroll() {
    window.addEventListener('scroll', () => {
        if (isLoadingPosts || !hasMorePosts) return;
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 400) loadMorePosts();
    });
}

async function loadMorePosts() {
    if (isLoadingPosts || !hasMorePosts) return;
    isLoadingPosts = true;
    const loadMore = document.getElementById('loadMore');
    if (loadMore) loadMore.style.display = 'flex';
    await new Promise(r => setTimeout(r, 300));
    const start = currentDisplayCount;
    const end = Math.min(start + POSTS_PER_PAGE, allPostsCache.length);
    if (start < allPostsCache.length) { await displayPosts(start, POSTS_PER_PAGE); currentDisplayCount = end; hasMorePosts = currentDisplayCount < allPostsCache.length; }
    else hasMorePosts = false;
    if (loadMore) loadMore.style.display = 'none';
    isLoadingPosts = false;
}

async function sharePost(postId) {
    const post = (await db.ref(`posts/${postId}`).once('value')).val();
    const shareRef = db.ref('posts').push();
    await shareRef.set({ id: shareRef.key, userId: currentUser.uid, userName: currentUser.displayName, userAvatar: currentUser.avatar, text: `🔄 مشاركة: ${post.text.substring(0,100)}`, originalPostId: postId, timestamp: Date.now() });
    refreshFeed();
    showToast('🔄 تمت المشاركة');
}

async function votePoll(postId, optionIndex) {
    const pollRef = db.ref(`posts/${postId}/poll`);
    const poll = (await pollRef.once('value')).val();
    if (poll.votes && poll.votes[currentUser.uid]) return showToast('✅ لقد صوت مسبقاً');
    await db.ref(`posts/${postId}/poll/votes/${currentUser.uid}`).set(optionIndex);
    await db.ref(`posts/${postId}/poll/totalVotes`).transaction(c => (c || 0) + 1);
    refreshFeed();
}

// ==================== Followers List ====================
async function openFollowersList(type) {
    const data = (await db.ref(`${type}/${currentProfileUser}`).once('value')).val();
    const container = document.getElementById('followersList');
    if (!data) { container.innerHTML = '<div class="text-center p-6 opacity-60">لا يوجد متابعين</div>'; document.getElementById('followersPanel').classList.add('open'); return; }
    let html = '';
    for (const uid of Object.keys(data)) {
        const user = (await db.ref(`users/${uid}`).once('value')).val();
        html += `<div class="follower-item" onclick="openProfile('${uid}')" style="display:flex;align-items:center;gap:12px;padding:12px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.05)">
                    <div class="post-avatar" style="width:44px;height:44px">${user?.avatar ? `<img src="${user.avatar}">` : '<i class="fa-solid fa-user text-white text-xl flex items-center justify-center h-full"></i>'}</div>
                    <div><div style="font-weight:700">${escapeHtml(user?.name)}</div><div style="font-size:12px;opacity:0.6">${escapeHtml(user?.bio?.substring(0,50) || '')}</div></div>
                </div>`;
    }
    container.innerHTML = html;
    document.getElementById('followersPanel').classList.add('open');
}

// ==================== Logout ====================
async function logout() {
    await auth.signOut();
    window.location.href = 'auth.html';
}

// ==================== Close Functions ====================
function closeCompose() { document.getElementById('composeModal').classList.remove('open'); document.getElementById('postText').value = ''; removeSelectedMedia(); document.getElementById('pollBuilder').style.display = 'none'; }
function openCompose() { document.getElementById('composeModal').classList.add('open'); }
function closeComments() { document.getElementById('commentsPanel').classList.remove('open'); }
function closeProfile() { document.getElementById('profilePanel').classList.remove('open'); }
function closeChat() { document.getElementById('chatPanel').classList.remove('open'); if (isRecording) stopVoiceRecording(); currentChatUser = null; }
function closeConversations() { document.getElementById('conversationsPanel').classList.remove('open'); }
function closeNotifications() { document.getElementById('notificationsPanel').classList.remove('open'); }
function closeAdmin() { document.getElementById('adminPanel').classList.remove('open'); }
function closeFollowers() { document.getElementById('followersPanel').classList.remove('open'); }
function switchTab(tab) { if (tab === 'home') refreshFeed(); }

// ==================== Auth Listener ====================
const loader = document.getElementById('loader');
auth.onAuthStateChanged(async (user) => {
    if (loader) { setTimeout(() => { loader.style.opacity = '0'; setTimeout(() => loader.style.display = 'none', 300); }, 500); }
    if (user) {
        currentUser = user;
        const snap = await db.ref(`users/${user.uid}`).once('value');
        if (snap.exists()) currentUser = { ...currentUser, ...snap.val() };
        else {
            await db.ref(`users/${user.uid}`).set({ name: user.displayName || user.email.split('@')[0], email: user.email, bio: "مرحباً! أنا في LUME ✨", avatar: "", cover: "", website: "", verified: false, isAdmin: user.email === ADMIN_EMAIL, blocked: {}, createdAt: Date.now() });
            currentUser.isAdmin = user.email === ADMIN_EMAIL;
        }
        document.getElementById('mainApp').style.display = 'block';
        if (localStorage.getItem('theme') === 'light') document.body.classList.add('light-mode');
        if (localStorage.getItem('readMode') === 'true') { readModeActive = true; document.getElementById('readModeToggle').classList.add('active'); document.body.style.fontSize = '18px'; document.body.style.lineHeight = '1.8'; }
        await loadBadWords();
        await refreshFeed();
        loadTrending();
        setInterval(async () => { if (currentUser) await db.ref(`users/${currentUser.uid}/lastSeen`).set(Date.now()); }, 60000);
    } else window.location.href = 'auth.html';
});

console.log('✅ LUME Fully Loaded - Ready to Go!');
