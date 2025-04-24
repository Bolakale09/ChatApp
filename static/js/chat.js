// Use dynamic protocol (ws or wss) based on current page protocol
let protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
let ws = new WebSocket(protocol + '//' + window.location.host + '/ws/chat/');
let currentReceiverId = null;
let selectedUser = null;

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
            // Get username from data attribute instead of template variable
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
            console.error("Error fetching messages:", error);
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
        // Show sending indicator
        const chatMessages = document.getElementById('chat-messages');
        const tempMessageDiv = document.createElement('div');
        const loggedInUser = chatMessages.dataset.username;

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

        ws.send(JSON.stringify({
            'message': message,
            'receiver_id': receiverId
        }));
        messageInput.value = '';
    }
}

// Update user status
function updateUserStatus(username, status) {
    document.querySelectorAll('.user-item').forEach(item => {
        if (item.getAttribute('data-username') === username) {
            const statusIndicator = item.querySelector('.status-indicator');
            const statusText = item.querySelector('.user-status');

            statusIndicator.className = `status-indicator ${status.toLowerCase()} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
            statusText.textContent = status;

            // If this is the selected user, update the header too
            if (selectedUser && selectedUser.username === username) {
                document.getElementById('receiver-status').className = `status-indicator ${status.toLowerCase()} absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white`;
                document.getElementById('receiver-status-text').textContent = status;
            }
        }
    });
}

// Load users and their status
function loadUsers() {
    // Show loading indicator for user list
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
            // Remove loading indicator
            const loadingElem = document.getElementById('users-loading');
            if (loadingElem) {
                loadingElem.remove();
            }

            if (data.users) {
                data.users.forEach(user => {
                    updateUserStatus(user.username, user.status);
                });
            }
        })
        .catch(error => {
            console.error('Error loading users:', error);
            // Show error in user list
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

// WebSocket connection handlers
ws.onopen = function() {
    console.log("WebSocket connection established");
    document.getElementById('send-button').disabled = currentReceiverId === null;

    // Add connection status indicator
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        connectionStatus.className = 'text-green-500 text-xs';
        connectionStatus.textContent = 'Connected';
    }

    loadUsers();
};

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    const chatMessages = document.getElementById('chat-messages');
    // Get username from data attribute instead of template variable
    const loggedInUser = chatMessages.dataset.username;

    if (data.type === 'user_status') {
        // Update user status
        updateUserStatus(data.username, data.status);
        return;
    }

    // Handle only messages related to the current conversation
    if ((data.sender === loggedInUser ||
        (selectedUser && data.sender === selectedUser.username) ||
        data.receiver_id === currentReceiverId)) {

        // Remove temporary "sending" message if this is a confirmation of our own message
        if (data.sender === loggedInUser) {
            const sendingMessages = chatMessages.querySelectorAll('.opacity-60');
            if (sendingMessages.length > 0) {
                sendingMessages[0].parentElement.remove();
            }
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = data.sender === loggedInUser ? 'flex justify-end mb-2' : 'flex justify-start mb-2';
        messageDiv.innerHTML = `
            ${data.sender !== loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full mr-2 self-end">` : ''}
            <div class="inline-block p-2 rounded-lg ${data.sender === loggedInUser ? 'bg-green-100' : 'bg-white'}">
                <p class="text-sm">${data.message}</p>
                <p class="text-xs text-gray-500">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
            </div>
            ${data.sender === loggedInUser ? `<img src="${data.sender_profile_picture || '/static/images/profile-icon.png'}" alt="Profile" class="w-8 h-8 rounded-full ml-2 self-end">` : ''}
        `;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
};

ws.onclose = function() {
    console.error("WebSocket connection closed. Attempting to reconnect...");
    document.getElementById('send-button').disabled = true;

    // Update connection status indicator
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        connectionStatus.className = 'text-red-500 text-xs';
        connectionStatus.textContent = 'Disconnected - Reconnecting...';
    }

    // Try to reconnect after a delay
    setTimeout(function() {
        protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(protocol + '//' + window.location.host + '/ws/chat/');
    }, 3000);
};

ws.onerror = function(error) {
    console.error("WebSocket error:", error);

    // Update connection status indicator
    const connectionStatus = document.getElementById('connection-status');
    if (connectionStatus) {
        connectionStatus.className = 'text-red-500 text-xs';
        connectionStatus.textContent = 'Connection Error';
    }
};

// Configure message input
document.addEventListener('DOMContentLoaded', function() {
    const messageInput = document.getElementById('message-input');

    // Add connection status indicator to the UI
    const headerElement = document.querySelector('header') || document.body;
    const connectionStatusElement = document.createElement('div');
    connectionStatusElement.id = 'connection-status';
    connectionStatusElement.className = 'text-yellow-500 text-xs';
    connectionStatusElement.textContent = 'Connecting...';
    headerElement.appendChild(connectionStatusElement);

    messageInput.onkeyup = function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            document.getElementById('send-button').click();
        }
    };
});