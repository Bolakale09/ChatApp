// Use dynamic protocol (ws or wss) based on current page protocol
let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws = null;
let currentReceiverId = null;
let selectedUser = null;

// Initialize WebSocket connection
function connectWebSocket() {
    ws = new WebSocket(protocol + '//' + window.location.host + '/ws/chat/');

    ws.onopen = function () {
        console.log('WebSocket connection established');
        document.getElementById('send-button').disabled = currentReceiverId === null;

        // Update connection status indicator
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            connectionStatus.className = 'text-green-500 text-xs';
            connectionStatus.textContent = 'Connected';
        }

        loadUsers(); // Load initial user statuses
    };

    ws.onmessage = function (event) {
        const data = JSON.parse(event.data);
        if (data.type === 'status_update') {
            updateUserStatuses(data.users);
        }
    };

    ws.onclose = function () {
        console.error('WebSocket connection closed. Attempting to reconnect...');
        document.getElementById('send-button').disabled = true;

        // Update connection status indicator
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            connectionStatus.className = 'text-red-500 text-xs';
            connectionStatus.textContent = 'Disconnected - Reconnecting...';
        }

        // Try to reconnect after a delay
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = function (error) {
        console.error('WebSocket error:', error);

        // Update connection status indicator
        const connectionStatus = document.getElementById('connection-status');
        if (connectionStatus) {
            connectionStatus.className = 'text-red-500 text-xs';
            connectionStatus.textContent = 'Connection Error';
        }
    };
}

// Update user statuses in the UI
function updateUserStatuses(users) {
    users.forEach(user => {
        const userItem = document.querySelector(`.user-item[data-user-id="${user.id}"]`);
        if (userItem) {
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
        }

        // Update receiver status in chat header if selected
        if (selectedUser && selectedUser.id == user.id) {
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
        }
    });
}

// Filter users when typing in search
document.getElementById('user-search').addEventListener('input', function (e) {
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

    // Update profile picture
    const userItem = document.querySelector(`.user-item[data-user-id="${userId}"]`);
    const profilePic = userItem.querySelector('img').src;
    document.getElementById('receiver-profile').src = profilePic;

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
    fetch(`/get_messages/?receiver=${userId}`)
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
                        <p class="text-xs text-gray-500">${new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
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

function sendMessage(event) {
    event.preventDefault();
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value.trim();
    const receiverId = document.getElementById('receiver-id').value;

    if (message && receiverId) {
        // Show temporary "sending" message
        const chatMessages = document.getElementById('chat-messages');
        const loggedInUser = chatMessages.dataset.username;
        const tempMessageDiv = document.createElement('div');
        tempMessageDiv.className = 'flex justify-end mb-2';
        tempMessageDiv.innerHTML = `
            <div class="inline-block p-2 rounded-lg bg-green-100 opacity-60">
                <p class="text-sm">${message}</p>
                <p class="text-xs text-gray-500">Sending...</p>
            </div>
            <img src="/static/images/profile-icon.png" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">
        `;
        chatMessages.appendChild(tempMessageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Send message via AJAX
        fetch('/send_message/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCookie('csrftoken'),
            },
            body: JSON.stringify({
                receiver_id: receiverId,
                content: message,
            }),
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    messageInput.value = '';
                    selectUser(currentReceiverId, selectedUser.username); // Refresh messages
                } else {
                    console.error('Error sending message:', data.error);
                    tempMessageDiv.remove();
                    alert('Failed to send message. Please try again.');
                }
            })
            .catch(error => {
                console.error('Error sending message:', error);
                tempMessageDiv.remove();
                alert('Failed to send message. Please try again.');
            });
    }
}

// Load users and their status (initial load)
function loadUsers() {
    const userList = document.getElementById('user-list');
    const loadingIndicator = document.createElement('div');
    loadingIndicator.id = 'users-loading';
    loadingIndicator.className = 'p-4 text-center';
    loadingIndicator.innerHTML = `
        <div class="animate-spin inline-block w-6 h-6 border-t-2 border-b-2 border-blue-500 rounded-full"></div>
        <p class="mt-2 text-gray-600">Loading users...</p>
    `;

    // Add loading indicator if user list is empty
    if (userList.children.length === 0) {
        userList.appendChild(loadingIndicator);
    }

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

// Configure message input and initialize WebSocket
document.addEventListener('DOMContentLoaded', function () {
    const messageInput = document.getElementById('message-input');

    // Add connection status indicator to the UI
    const headerElement = document.querySelector('header') || document.body;
    const connectionStatusElement = document.createElement('div');
    connectionStatusElement.id = 'connection-status';
    connectionStatusElement.className = 'text-yellow-500 text-xs';
    connectionStatusElement.textContent = 'Connecting...';
    headerElement.appendChild(connectionStatusElement);

    messageInput.onkeyup = function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            document.getElementById('send-button').click();
        }
    };

    // Initialize WebSocket connection
    connectWebSocket();
});