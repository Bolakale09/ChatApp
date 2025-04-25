// Use dynamic protocol (ws or wss) based on current page protocol
let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws;
let currentReceiverId = null;
let selectedUser = null;
let pingInterval = null;
let reconnectAttempts = 0;
let selectedImageFile = null;
let selectedImageData = null;
const MAX_RECONNECT_ATTEMPTS = 5;

// Initialize WebSocket connection
function connectWebSocket() {
    ws = new WebSocket(protocol + '//' + window.location.host + '/ws/chat/');

    ws.onopen = function() {
        console.log('WebSocket connection established');
        document.getElementById('send-button').disabled = currentReceiverId === null;
        reconnectAttempts = 0; // Reset reconnect counter on successful connection

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
                ws.send(JSON.stringify({ 'type': 'ping' }));
            }
        }, 30000); // Ping every 30 seconds
    };

    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            const chatMessages = document.getElementById('chat-messages');
            // Get username from data attribute
            const loggedInUser = chatMessages ? chatMessages.dataset.username : '';

            // Handle different message types
            if (data.type === 'error') {
                console.error('WebSocket error:', data.error);
                showNotification('Error: ' + data.error, 'error');
                return;
            }

            if (data.type === 'pong') {
                // Connection keepalive response
                return;
            }

            if (data.type === 'status_update') {
                updateUserStatuses(data.users);
                return;
            }

            if (data.type === 'user_status') {
                // Update single user status
                updateUserStatus(data.username, data.status);
                return;
            }

            if (data.type === 'chat_message') {
                // Handle only messages related to the current conversation
                if ((data.sender === loggedInUser ||
                    (selectedUser && data.sender === selectedUser.username) ||
                    (currentReceiverId && data.sender_id === parseInt(currentReceiverId)) ||
                    (currentReceiverId && data.receiver_id === parseInt(currentReceiverId)))) {

                    // Remove temporary "sending" message if this is a confirmation of our own message
                    if (data.sender === loggedInUser) {
                        const sendingMessages = chatMessages.querySelectorAll('.opacity-60');
                        if (sendingMessages.length > 0) {
                            sendingMessages[0].parentElement.remove();
                        }
                    }

                    const messageDiv = document.createElement('div');
                    messageDiv.className = data.sender === loggedInUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';

                    // Get message content from either message or content field
                    const messageContent = data.message || data.content || '';
                    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                                    : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                    messageDiv.innerHTML = `
                        ${data.sender !== loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full mr-2 self-end">` : ''}
                        <div class="inline-block p-2 rounded-lg ${data.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
                            <p class="text-sm">${messageContent}</p>
                            <p class="text-xs text-gray-500">${timestamp}</p>
                        </div>
                        ${data.sender === loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">` : ''}
                    `;
                    chatMessages.appendChild(messageDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    };

    ws.onclose = function(event) {
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
            console.log(`Attempting to reconnect in ${delay/1000} seconds...`);
            setTimeout(connectWebSocket, delay);
        } else {
            if (connectionStatus) {
                connectionStatus.textContent = 'Connection failed - Refresh page to try again';
            }
            showNotification('Connection to chat server lost. Please refresh the page.', 'error');
        }
    };

    ws.onerror = function(error) {
        console.error('WebSocket error:', error);

        // Update connection status indicator
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            connectionStatus.className = 'text-red-500 text-xs';
            connectionStatus.textContent = 'Connection Error';
        }
    };
}

// Filter users when typing in search
document.getElementById('user-search').addEventListener('input', function(e) {
    const searchTerm = e.target.value.toLowerCase();
    document.querySelectorAll('.user-item').forEach(item => {
        const username = item.getAttribute('data-username').toLowerCase();
        item.style.display = username.includes(searchTerm) ? 'flex' : 'none';
    });
});

function selectUser(userId, username) {
    currentReceiverId = userId;
    selectedUser = {
        id: userId,
        username: username
    };

    // Update UI
    document.getElementById('receiver-id').value = userId;
    document.getElementById('receiver-name').textContent = username;
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-button').disabled = false;

    // Update active user in sidebar
    document.querySelectorAll('.user-item').forEach(item => {
        if (parseInt(item.getAttribute('data-user-id')) === userId) {
            item.classList.add('bg-gray-200');
        } else {
            item.classList.remove('bg-gray-200');
        }
    });

    // Update profile picture and status for the selected user
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

    // Fetch and display messages for the selected user
    fetch(`/api/messages/?receiver=${userId}`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
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

            data.forEach(message => {
                const messageDiv = document.createElement('div');
                messageDiv.className = message.sender === loggedInUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';
                messageDiv.innerHTML = `
                    ${message.sender !== loggedInUser ? `<img src="${message.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full mr-2 self-end">` : ''}
                    <div class="inline-block p-2 rounded-lg ${message.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
                        <p class="text-sm">${message.content}</p>
                        <p class="text-xs text-gray-500">${new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                    </div>
                    ${message.sender === loggedInUser ? `<img src="${message.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">` : ''}
                `;
                chatMessages.appendChild(messageDiv);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
        })
        .catch(error => {
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

// Add this function to handle image selection and preview
function handleImageUpload() {
    const fileInput = document.getElementById('image-file');
    const imageUploadBtn = document.getElementById('image-upload-btn');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const imagePreview = document.getElementById('image-preview');
    const removeImageBtn = document.getElementById('remove-image');

    // Connect the upload button to the file input
    imageUploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];

            // Check file size (limit to 5MB)
            if (file.size > 5 * 1024 * 1024) {
                showNotification('Image too large. Maximum size is 5MB.', 'error');
                fileInput.value = '';
                return;
            }

            // Check file type
            if (!file.type.startsWith('image/')) {
                showNotification('Please select an image file.', 'error');
                fileInput.value = '';
                return;
            }

            // Store the file for later upload
            selectedImageFile = file;

            // Create a preview
            const reader = new FileReader();
            reader.onload = (e) => {
                selectedImageData = e.target.result;
                imagePreview.src = e.target.result;
                imagePreviewContainer.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        }
    });

    // Handle removing the image
    removeImageBtn.addEventListener('click', () => {
        selectedImageFile = null;
        selectedImageData = null;
        imagePreviewContainer.classList.add('hidden');
        fileInput.value = '';
    });
}

// Modified sendMessage function to include image handling
function sendMessage(event) {
    event.preventDefault();
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    const receiverId = document.getElementById('receiver-id').value;

    // Check if we have a message or an image
    if ((!message && !selectedImageFile) || !receiverId) {
        return;
    }

    // Show temporary "sending" message/image
    const chatMessages = document.getElementById('chat-messages');
    const loggedInUser = chatMessages.dataset.username;
    const tempMessageDiv = document.createElement('div');
    tempMessageDiv.className = 'flex justify-end mb-2';

    // Create content based on whether it's an image, text, or both
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

    // Prepare form data for sending
    const formData = new FormData();
    formData.append('receiver_id', receiverId);
    if (message) {
        formData.append('content', message);
    }
    if (selectedImageFile) {
        formData.append('image', selectedImageFile);
    }

    // Send via API rather than WebSocket for file uploads
    fetch('/api/send_message/', {
        method: 'POST',
        headers: {
            'X-CSRFToken': getCookie('csrftoken'),
        },
        body: formData,
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === 'success') {
            // Clear inputs
            messageInput.value = '';
            if (selectedImageFile) {
                document.getElementById('remove-image').click();
            }

            // Remove temporary message
            tempMessageDiv.remove();

            // Add the confirmed message
            const messageDiv = document.createElement('div');
            messageDiv.className = 'flex justify-end mb-2';

            let confirmedContent = '';
            if (data.image_url) {
                confirmedContent += `<img src="${data.image_url}" class="max-w-xs max-h-60 rounded" alt="Image">`;
            }
            if (message) {
                confirmedContent += `<p class="text-sm mt-1">${message}</p>`;
            }

            messageDiv.innerHTML = `
                <div class="inline-block p-2 rounded-lg bg-green-100">
                    ${confirmedContent}
                    <p class="text-xs text-gray-500 mt-1">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                </div>
                <img src="/static/images/profile-icon.png" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">
            `;

            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        } else {
            console.error('Error sending message:', data.error);
            tempMessageDiv.remove();
            showNotification('Failed to send message. Please try again.', 'error');
        }
    })
    .catch(error => {
        console.error('Error sending message:', error);
        tempMessageDiv.remove();
        showNotification('Failed to send message. Please try again.', 'error');
    });
}

// Updated chat message handler to support images
function onChatMessage(data, loggedInUser, chatMessages) {
    // Remove temporary "sending" message if this is a confirmation of our own message
    if (data.sender === loggedInUser) {
        const sendingMessages = chatMessages.querySelectorAll('.opacity-60');
        if (sendingMessages.length > 0) {
            sendingMessages[0].parentElement.remove();
        }
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = data.sender === loggedInUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';

    // Get message content from either message or content field
    const messageContent = data.message || data.content || '';
    const imageUrl = data.image_url || '';
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
                                    : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

    // Build content HTML based on whether we have an image, text, or both
    let contentHtml = '';
    if (imageUrl) {
        contentHtml += `<img src="${imageUrl}" class="max-w-xs max-h-60 rounded" alt="Image">`;
    }
    if (messageContent) {
        contentHtml += `<p class="text-sm ${imageUrl ? 'mt-1' : ''}">${messageContent}</p>`;
    }

    messageDiv.innerHTML = `
        ${data.sender !== loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full mr-2 self-end">` : ''}
        <div class="inline-block p-2 rounded-lg ${data.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
            ${contentHtml}
            <p class="text-xs text-gray-500">${timestamp}</p>
        </div>
        ${data.sender === loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">` : ''}
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Update user statuses in the UI
function updateUserStatuses(users) {
    const userList = document.getElementById('user-list');
    if (!userList) return;

    const receiverId = document.getElementById('receiver-id').value;

    // Update existing users and add new ones
    users.forEach((user) => {
        let userItem = userList.querySelector(`.user-item[data-user-id="${user.id}"]`);

        if (userItem) {
            // Update existing user
            const statusIndicator = userItem.querySelector('.status-indicator');
            const statusText = userItem.querySelector('.user-status');

            if (user.is_online) {
                statusIndicator.classList.remove('offline');
                statusIndicator.classList.add('online');
                statusText.textContent = 'Online';
            } else {
                statusIndicator.classList.remove('online');
                statusIndicator.classList.add('offline');
                statusText.textContent = 'Offline';
            }

            // Update profile picture if provided
            if (user.profile_picture) {
                const profileImg = userItem.querySelector('img');
                if (profileImg) {
                    profileImg.src = user.profile_picture;
                }
            }
        } else {
            // Create new user item if it doesn't exist
            createUserItem(userList, user);
        }

        // Update receiver status in chat header if this is the selected user
        if (receiverId && parseInt(receiverId) === user.id) {
            const receiverStatus = document.getElementById('receiver-status');
            const receiverStatusText = document.getElementById('receiver-status-text');
            if (user.is_online) {
                receiverStatus.classList.remove('offline');
                receiverStatus.classList.add('online');
                receiverStatusText.textContent = 'Online';
            } else {
                receiverStatus.classList.remove('online');
                receiverStatus.classList.add('offline');
                receiverStatusText.textContent = 'Offline';
            }

            // Update profile picture if provided
            if (user.profile_picture) {
                const receiverProfileImg = document.getElementById('receiver-profile');
                if (receiverProfileImg) {
                    receiverProfileImg.src = user.profile_picture;
                }
            }
        }
    });

    // Sort users: online first, then alphabetically
    sortUserList(userList);
}

// Create a new user item in the list
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

// Sort user list: online users first, then alphabetically
function sortUserList(userList) {
    const items = Array.from(userList.querySelectorAll('.user-item'));

    items.sort((a, b) => {
        const aOnline = a.querySelector('.status-indicator').classList.contains('online');
        const bOnline = b.querySelector('.status-indicator').classList.contains('online');

        if (aOnline && !bOnline) return -1;
        if (!aOnline && bOnline) return 1;

        // If both have same online status, sort alphabetically
        const aName = a.getAttribute('data-username').toLowerCase();
        const bName = b.getAttribute('data-username').toLowerCase();
        return aName.localeCompare(bName);
    });

    // Clear and re-add items in sorted order
    items.forEach(item => userList.appendChild(item));
}

// Update single user status
function updateUserStatus(username, status) {
    document.querySelectorAll('.user-item').forEach(item => {
        if (item.getAttribute('data-username') === username) {
            const statusIndicator = item.querySelector('.status-indicator');
            const statusText = item.querySelector('.user-status');
            const statusValue = status.toLowerCase() === 'online' ? 'online' : 'offline';

            statusIndicator.className = `status-indicator ${statusValue} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
            statusText.textContent = status;

            // If this is the selected user, update the header too
            if (selectedUser && selectedUser.username === username) {
                document.getElementById('receiver-status').className = `status-indicator ${statusValue} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
                document.getElementById('receiver-status-text').textContent = status;
            }
        }
    });

    // Resort user list since online status changed
    sortUserList(document.getElementById('user-list'));
}

// Show notification toast
function showNotification(message, type = 'info') {
    // Check if notification container exists, create if not
    let notificationContainer = document.getElementById('notification-container');
    if (!notificationContainer) {
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'notification-container';
        notificationContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(notificationContainer);
    }

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `p-3 rounded shadow-lg max-w-xs transition-all transform translate-x-0 ${
        type === 'error' ? 'bg-red-100 text-red-700 border-l-4 border-red-500' : 
        type === 'success' ? 'bg-green-100 text-green-700 border-l-4 border-green-500' : 
        'bg-blue-100 text-blue-700 border-l-4 border-blue-500'
    }`;
    notification.innerHTML = message;

    // Add to container
    notificationContainer.appendChild(notification);

    // Remove after delay
    setTimeout(() => {
        notification.classList.add('opacity-0');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 4000);
}

// Load users and their status (initial load)
function loadUsers() {
    // WebSocket should now handle this on connect
    // But keep this as a fallback
    const userList = document.getElementById('user-list');
    if (!userList || userList.children.length > 0) return;

    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'users-loading';
    loadingIndicator.className = 'p-4 text-center';
    loadingIndicator.innerHTML = `
        <div class="animate-spin inline-block w-6 h-6 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
        <p class="mt-2 text-gray-600">Loading users...</p>
    `;

    // Add loading indicator if user list is empty
    userList.appendChild(loadingIndicator);

    fetch('/api/users/')
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            const loadingElem = document.getElementById('users-loading');
            if (loadingElem) {
                loadingElem.remove();
            }

            if (data.users) {
                updateUserStatuses(data.users);
            }
        })
        .catch(error => {
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

function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

// Add styles for status indicators
function addStatusStyles() {
    if (!document.getElementById('chat-styles')) {
        const styleSheet = document.createElement('style');
        styleSheet.id = 'chat-styles';
        styleSheet.textContent = `
            .status-indicator.online {
                background-color: #10B981; /* Green color for online */
            }
            .status-indicator.offline {
                background-color: #9CA3AF; /* Gray color for offline */
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

// Configure message input and initialize WebSocket
document.addEventListener('DOMContentLoaded', function() {
    // Add styles
    addStatusStyles();

    const messageInput = document.getElementById('message-input');
    if (!messageInput) return; // Exit if we're not on chat page

    // Initialize image upload if we're on the chat page
    const imageUploadBtn = document.getElementById('image-upload-btn');
    if (imageUploadBtn) {
        handleImageUpload();

        // Enable/disable the image upload button together with the message input
        const enableChatInput = function(enabled) {
            document.getElementById('message-input').disabled = !enabled;
            document.getElementById('send-button').disabled = !enabled;
            document.getElementById('image-upload-btn').disabled = !enabled;
        };

        // Update the selectUser function to also enable the image upload
        const originalSelectUser = selectUser;
        selectUser = function(userId, username) {
            originalSelectUser(userId, username);
            enableChatInput(true);
        };
    }

    // Add connection status indicator to the UI
    const headerElement = document.querySelector('header') || document.body;
    const connectionStatusElement = document.createElement('div');
    connectionStatusElement.id = 'connection-status';
    connectionStatusElement.className = 'text-yellow-500 text-xs';
    connectionStatusElement.textContent = 'Connecting...';
    headerElement.appendChild(connectionStatusElement);

    messageInput.onkeyup = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('send-button').click();
        }
    };

    // Allow Enter key to submit but Shift+Enter for new line
    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
        }
    });

    // Initialize WebSocket connection
    connectWebSocket();

    // Setup visibility change handler to reconnect if needed
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            // Check if WebSocket is closed and reconnect if needed
            if (!ws || ws.readyState !== WebSocket.OPEN) {
                console.log('Page visible again, checking WebSocket connection...');
                connectWebSocket();
            }
        }
    });
});

// Handle page unload to properly disconnect
window.addEventListener('beforeunload', function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        // Close WebSocket gracefully
        ws.close();
    }
    clearInterval(pingInterval);
});
