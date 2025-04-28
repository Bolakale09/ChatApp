// Use dynamic protocol (ws or wss) based on current page protocol
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws;
let currentReceiverId = null;
let currentUsername = null;
let selectedUser = null;
let pingInterval = null;
let reconnectAttempts = 0;
let selectedImageFile = null;
let selectedImageData = null;
const MAX_RECONNECT_ATTEMPTS = 5;

// Initialize WebSocket connection
function connectWebSocket() {
  ws = new WebSocket(`${protocol}//${window.location.host}/ws/chat/`);

  ws.onopen = () => {
    console.log('WebSocket connection established');
    document.getElementById('send-button').disabled = currentReceiverId === null;
    reconnectAttempts = 0;

    // Update connection status indicator
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
      connectionStatus.className = 'text-green-500 text-xs';
      connectionStatus.textContent = 'Connected';
    }

    // Setup ping interval to keep connection alive
    clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  };

  ws.onmessage = (event) => {
    try {
      console.log('Data:', event.data);
      const data = JSON.parse(event.data);
      const chatMessages = document.getElementById('chat-messages');
      const loggedInUser = chatMessages ? chatMessages.dataset.username : '';

      // Handle different message types
      if (data.type === 'error') {
        console.error('WebSocket error:', data.error);
        showNotification(`Error: ${data.error}`, 'error');
        return;
      }

      if (data.type === 'pong') {
        return;
      }

      if (data.type === 'status_update') {
        updateUserStatuses(data.users);
        return;
      }

      if (data.type === 'user_status') {
        updateUserStatus(data.username, data.status);
        return;
      }

      if (data.type === 'chat_message') {
        if (
          data.sender === loggedInUser ||
          (selectedUser && data.sender === selectedUser.username) ||
          (currentReceiverId && data.sender_id === parseInt(currentReceiverId)) ||
          (currentReceiverId && data.receiver_id === parseInt(currentReceiverId))
        ) {
          onChatMessage(data, loggedInUser, chatMessages);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  };

  ws.onclose = (event) => {
    console.error('WebSocket connection closed. Code:', event.code);
    clearInterval(pingInterval);
    document.getElementById('send-button').disabled = true;

    // Update connection status indicator
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
      connectionStatus.className = 'text-red-500 text-xs';
      connectionStatus.textContent = 'Disconnected - Reconnecting...';
    }

    // Try to reconnect with incremental backoff
    reconnectAttempts++;
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts - 1), 30000);
      console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
      setTimeout(connectWebSocket, delay);
    } else {
      if (connectionStatus) {
        connectionStatus.textContent = 'Connection failed - Refresh page to try again';
      }
      showNotification('Connection to chat server lost. Please refresh the page.', 'error');
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
      connectionStatus.className = 'text-red-500 text-xs';
      connectionStatus.textContent = 'Connection Error';
    }
  };
}

// Filter users when typing in search
document.getElementById('user-search').addEventListener('input', (e) => {
  const searchTerm = e.target.value.toLowerCase();
  document.querySelectorAll('.user-item').forEach((item) => {
    const username = item.getAttribute('data-username').toLowerCase();
    item.style.display = username.includes(searchTerm) ? 'flex' : 'none';
  });
});

function selectUser(userId, username) {
  currentReceiverId = userId;
  currentUsername = username;
  selectedUser = { id: userId, username };

  // Update UI
  document.getElementById('receiver-id').value = userId;
  document.getElementById('receiver-name').textContent = username;
  document.getElementById('message-input').disabled = false;
  document.getElementById('send-button').disabled = false;

  // Update active user in sidebar
  document.querySelectorAll('.user-item').forEach((item) => {
    if (parseInt(item.getAttribute('data-user-id')) === userId) {
      item.classList.add('bg-gray-200');
    } else {
      item.classList.remove('bg-gray-200');
    }
  });

  // Update profile picture and status
  const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
  if (userItem) {
    const profilePicture = userItem.querySelector('img').src;
    const isOnline = userItem.querySelector('.status-indicator').classList.contains('online');

    document.getElementById('receiver-profile').src = profilePicture;
    const receiverStatus = document.getElementById('receiver-status');
    const receiverStatusText = document.getElementById('receiver-status-text');
    receiverStatus.classList.remove('online', 'offline');
    receiverStatus.classList.add(isOnline ? 'online' : 'offline');
    receiverStatusText.textContent = isOnline ? 'Online' : 'Offline';
  }

  // Show loading indicator
  const chatMessages = document.getElementById('chat-messages');
  chatMessages.innerHTML = `
    <div class="flex justify-center items-center h-full">
      <div class="loading-spinner">
        <div class="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        <p class="mt-2 text-gray-600">Loading messages...</p>
      </div>
    </div>
  `;

  // Fetch and display messages
  fetch(`/api/messages/?receiver=${userId}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      console.log('Response Data:', JSON.stringify(data));
      chatMessages.innerHTML = '';
      const loggedInUser = chatMessages.dataset.username;

      if (data.length === 0) {
        chatMessages.innerHTML = `
          <div class="flex justify-center items-center h-full">
            <p class="text-gray-500">No messages yet. Start a conversation!</p>
          </div>
        `;
        return;
      }

      data.forEach((message) => {
        const messageDiv = document.createElement('div');
        messageDiv.className = message.sender === loggedInUser
          ? 'flex justify-end mb-3 px-3'
          : 'flex justify-start mb-3 px-3';

        let contentHtml = '';
        if (message.image_url) {
          contentHtml += `
            <img src="${message.image_url}" width="350" alt="Uploaded Image" 
                 class="w-[60px] h-auto rounded-lg shadow-sm object-cover mb-1">
          `;
        }
        if (message.content) {
          contentHtml += `<p class="text-sm leading-relaxed">${message.content}</p>`;
        }

        const timestamp = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        messageDiv.innerHTML = `
          <div class="inline-block p-3 rounded-xl shadow-sm transition-all duration-200 hover:shadow-md 
                      ${message.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
            ${contentHtml}
            <p class="text-xs text-gray-500 mt-1 text-${message.sender === loggedInUser ? 'right' : 'left'}">
              ${timestamp}
            </p>
          </div>
        `;
        chatMessages.appendChild(messageDiv);
      });
      chatMessages.scrollTop = chatMessages.scrollHeight;
    })
    .catch((error) => {
      console.error('Error fetching messages:', error);
      chatMessages.innerHTML = `
        <div class="flex justify-center items-center h-full">
          <div class="text-center">
            <p class="text-red-500">Error loading messages</p>
            <button onclick="selectUser(${userId}, '${username}')" class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
              Try Again
            </button>
          </div>
        </div>
      `;
    });
}

function handleImageUpload() {
  const fileInput = document.getElementById('image-file');
  const imageUploadBtn = document.getElementById('image-upload-btn');
  const imagePreviewContainer = document.getElementById('image-preview-container');
  const imagePreview = document.getElementById('image-preview');
  const removeImageBtn = document.getElementById('remove-image');

  imageUploadBtn.addEventListener('click', () => {
    console.log('Image upload button clicked');
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    console.log('File input changed', e);
    if (fileInput.files && fileInput.files[0]) {
      const file = fileInput.files[0];

      if (file.size > 5 * 1024 * 1024) {
        showNotification('Image too large. Maximum size is 5MB.', 'error');
        fileInput.value = '';
        return;
      }

      if (!file.type.startsWith('image/')) {
        showNotification('Please select an image file.', 'error');
        fileInput.value = '';
        return;
      }

      selectedImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        selectedImageData = e.target.result;
        imagePreview.src = e.target.result;
        imagePreviewContainer.classList.remove('hidden');
      };
      reader.readAsDataURL(file);
    }
  });

  removeImageBtn.addEventListener('click', () => {
    selectedImageFile = null;
    selectedImageData = null;
    imagePreviewContainer.classList.add('hidden');
    fileInput.value = '';
  });
}

function sendMessage(event) {
  event.preventDefault();
  const messageInput = document.getElementById('message-input');
  const message = messageInput.value.trim();
  const receiverId = document.getElementById('receiver-id').value;

  if ((!message && !selectedImageFile) || !receiverId) {
    return;
  }

  const chatMessages = document.getElementById('chat-messages');
  const loggedInUser = chatMessages.dataset.username;
  const tempMessageDiv = document.createElement('div');
  tempMessageDiv.className = 'flex justify-end mb-2';

  let messageContent = '';
  if (selectedImageFile) {
    messageContent += `<img src="${selectedImageData}" class="max-w-xs max-h-60 rounded" alt="Image">`;
  }
  if (message) {
    messageContent += `<p class="text-sm mt-1">${message}</p>`;
  }

  tempMessageDiv.innerHTML = `
    <div class="inline-block p-2 rounded-lg bg-green-100 opacity-60">
      ${messageContent}
      <p class="text-xs text-gray-500 mt-1">Sending...</p>
    </div>
    <img src="/static/images/profile-icon.png" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">
  `;

  chatMessages.appendChild(tempMessageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const sendWebSocketMessage = (imageBase64 = '') => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const messageData = {
        type: 'chat_message',
        receiver_id: parseInt(receiverId),
        message: message || '',
        image_base64: imageBase64
      };

      console.log(messageData);
      ws.send(JSON.stringify(messageData));
      messageInput.value = '';
      if (selectedImageFile) {
        document.getElementById('remove-image').click();
      }
      selectUser(currentReceiverId, currentUsername);
    } else {
      console.error('WebSocket is not connected');
      tempMessageDiv.remove();
      showNotification('Cannot send message: WebSocket disconnected.', 'error');
    }
  };

  if (selectedImageFile) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64String = e.target.result.split(',')[1];
      sendWebSocketMessage(base64String);
    };
    reader.onerror = (e) => {
      console.error('Error reading image file:', e.toString());
      tempMessageDiv.remove();
      showNotification('Failed to process image. Please try again.', 'error');
    };
    reader.readAsDataURL(selectedImageFile);
  } else {
    sendWebSocketMessage();
  }
}

function onChatMessage(data, loggedInUser, chatMessages) {
  if (data.sender === loggedInUser) {
    const sendingMessages = chatMessages.querySelectorAll('.opacity-60');
    if (sendingMessages.length > 0) {
      sendingMessages[0].parentElement.remove();
    }
  }

  const messageDiv = document.createElement('div');
  messageDiv.className = data.sender === loggedInUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';

  const messageContent = data.message || data.content || '';
  const imageUrl = data.image_url || '';
  const timestamp = data.timestamp
    ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  let contentHtml = '';
  if (imageUrl) {
    contentHtml += `
      <img src="${imageUrl}" class="max-w-xs max-h-60 rounded" alt="Image" 
           onerror="this.onerror=null; this.src='/static/images/image-placeholder.png'; this.classList.add('error-image'); 
           this.parentElement.insertAdjacentHTML('beforeend', '<p class=\\'text-xs text-red-500 mt-1\\'>Image failed to load</p>');">
    `;
  }
  if (messageContent) {
    contentHtml += `<p class="text-sm ${imageUrl ? 'mt-1' : ''}">${messageContent}</p>`;
  }

  messageDiv.innerHTML = `
    ${data.sender !== loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full mr-2 self-end" onerror="this.onerror=null; this.src='/static/images/profile-icon.png';">` : ''}
    <div class="inline-block p-2 rounded-lg ${data.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
      ${contentHtml}
      <p class="text-xs text-gray-500">${timestamp}</p>
    </div>
    ${data.sender === loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end" onerror="this.onerror=null; this.src='/static/images/profile-icon.png';">` : ''}
  `;
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateUserStatuses(users) {
  const userList = document.getElementById('user-list');
  if (!userList) return;

  const selectedUserId = document.querySelector('.user-item.bg-gray-200')?.getAttribute('data-user-id');

  while (userList.firstChild) {
    if (userList.firstChild.id !== 'users-loading') {
      userList.removeChild(userList.firstChild);
    } else if (userList.firstChild.id === 'users-loading' && users.length > 0) {
      userList.removeChild(userList.firstChild);
    }
  }

  const addedUsernames = new Set();
  users.forEach((user) => {
    if (addedUsernames.has(user.username)) return;
    addedUsernames.add(user.username);
    createUserItem(userList, user);
  });

  if (selectedUserId) {
    const selectedItem = userList.querySelector(`.user-item[data-user-id="${selectedUserId}"]`);
    if (selectedItem) {
      selectedItem.classList.add('bg-gray-200');
    }
  }

  sortUserList(userList);

  const receiverId = document.getElementById('receiver-id').value;
  if (receiverId) {
    const matchingUser = users.find((u) => u.id.toString() === receiverId);
    if (matchingUser) {
      updateReceiverStatus(matchingUser);
    }
  }
}

function updateReceiverStatus(user) {
  const receiverStatus = document.getElementById('receiver-status');
  const receiverStatusText = document.getElementById('receiver-status-text');

  if (receiverStatus && receiverStatusText) {
    if (user.is_online) {
      receiverStatus.classList.remove('offline');
      receiverStatus.classList.add('online');
      receiverStatusText.textContent = 'Online';
    } else {
      receiverStatus.classList.remove('online');
      receiverStatus.classList.add('offline');
      receiverStatusText.textContent = 'Offline';
    }

    if (user.profile_picture) {
      const receiverProfileImg = document.getElementById('receiver-profile');
      if (receiverProfileImg) {
        receiverProfileImg.src = user.profile_picture;
      }
    }
  }
}

function createUserItem(userList, user) {
  const userItem = document.createElement('div');
  userItem.className = 'user-item flex items-center p-2 hover:bg-gray-100 cursor-pointer';
  userItem.setAttribute('data-user-id', user.id);
  userItem.setAttribute('data-username', user.username);
  userItem.setAttribute('onclick', `selectUser(${user.id}, '${user.username}')`);

  userItem.innerHTML = `
    <div class="relative mr-2">
      <img src="${user.profile_picture || '/static/images/profile-icon.png'}" alt="${user.username}" class="w-10 h-10 rounded-full">
      <div class="status-indicator ${user.is_online ? 'online' : 'offline'} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white"></div>
    </div>
    <div class="flex-1">
      <h3 class="font-medium">${user.username}</h3>
      <p class="user-status text-xs text-gray-500">${user.is_online ? 'Online' : 'Offline'}</p>
    </div>
  `;

  userList.appendChild(userItem);
}

function sortUserList(userList) {
  const items = Array.from(userList.querySelectorAll('.user-item'));

  items.sort((a, b) => {
    const aOnline = a.querySelector('.status-indicator').classList.contains('online');
    const bOnline = b.querySelector('.status-indicator').classList.contains('online');

    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;

    const aName = a.getAttribute('data-username').toLowerCase();
    const bName = b.getAttribute('data-username').toLowerCase();
    return aName.localeCompare(bName);
  });

  items.forEach((item) => userList.appendChild(item));
}

function updateUserStatus(username, status) {
  document.querySelectorAll('.user-item').forEach((item) => {
    if (item.getAttribute('data-username') === username) {
      const statusIndicator = item.querySelector('.status-indicator');
      const statusText = item.querySelector('.user-status');
      const statusValue = status.toLowerCase() === 'online' ? 'online' : 'offline';

      statusIndicator.className = `status-indicator ${statusValue} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
      Mp1statusText.textContent = status;

      if (selectedUser && selectedUser.username === username) {
        document.getElementById('receiver-status').className = `status-indicator ${statusValue} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
        document.getElementById('receiver-status-text').textContent = status;
      }
    }
  });

  sortUserList(document.getElementById('user-list'));
}

function showNotification(message, type = 'info') {
  let notificationContainer = document.getElementById('notification-container');
  if (!notificationContainer) {
    notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
    document.body.appendChild(notificationContainer);
  }

  const notification = document.createElement('div');
  notification.className = `p-3 rounded shadow-lg max-w-xs transition-all transform translate-x-0 ${
    type === 'error' ? 'bg-red-100 text-red-700 border-l-4 border-red-500' :
    type === 'success' ? 'bg-green-100 text-green-700 border-l-4 border-green-500' :
    'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
  }`;
  notification.innerHTML = message;

  notificationContainer.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('opacity-0');
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 4000);
}

function loadUsers() {
  console.log('Loading Users...');
  const userList = document.getElementById('user-list');
  if (!userList || userList.children.length > 0) return;

  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'users-loading';
  loadingIndicator.className = 'p-4 text-center';
  loadingIndicator.innerHTML = `
    <div class="animate-spin inline-block w-6 h-6 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
    <p class="mt-2 text-gray-600">Loading users...</p>
  `;

  userList.appendChild(loadingIndicator);

  fetch('/api/users/')
    .then((response) => {
      console.log(response);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      const loadingElem = document.getElementById('users-loading');
      if (loadingElem) {
        loadingElem.remove();
      }

      if (data.users) {
        updateUserStatuses(data.users);
      }
    })
    .catch((error) => {
      console.error('Error loading users:', error);
      const loadingElem = document.getElementById('users-loading');
      if (loadingElem) {
        loadingElem.innerHTML = `
          <p class="text-red-500">Error loading users</p>
          <button onclick="loadUsers()" class="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Try Again
          </button>
        `;
      }
    });
}

function addStatusStyles() {
  if (!document.getElementById('chat-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'chat-styles';
    styleSheet.textContent = `
      .status-indicator.online {
        background-color: #10B981;
      }
      .status-indicator.offline {
        background-color: #9CA3AF;
      }
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
      #notification-container > div {
        transition: opacity 0.3s ease-in-out;
      }
    `;
    document.head.appendChild(styleSheet);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  addStatusStyles();

  const messageInput = document.getElementById('message-input');
  if (!messageInput) return;

  const imageUploadBtn = document.getElementById('image-upload-btn');
  if (imageUploadBtn) {
    const enableChatInput = (enabled) => {
      document.getElementById('message-input').disabled = !enabled;
      document.getElementById('send-button').disabled = !enabled;
      document.getElementById('image-upload-btn').disabled = !enabled;
    };

    handleImageUpload();

    const originalSelectUser = window.selectUser || selectUser;
    window.selectUser = (userId, username) => {
      originalSelectUser(userId, username);
      enableChatInput(true);
      document.getElementById('image-upload-btn').disabled = false;
    };
  }

  const headerElement = document.querySelector('header') || document.body;
  const connectionStatusElement = document.createElement('div');
  connectionStatusElement.id = 'connection-status';
  connectionStatusElement.className = 'text-yellow-500 text-xs';
  connectionStatusElement.textContent = 'Connecting...';
  headerElement.appendChild(connectionStatusElement);

  messageInput.onkeyup = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.getElementById('send-button').click();
    }
  };

  messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
    }
  });

  connectWebSocket();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        console.log('Page visible again, checking WebSocket connection...');
        connectWebSocket();
      }
    }
  });
});

window.addEventListener('beforeunload', () => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  clearInterval(pingInterval);
});