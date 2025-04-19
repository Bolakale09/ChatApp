let ws = new WebSocket('ws://' + window.location.host + '/ws/chat/');
let currentReceiverId = null;

function selectUser(userId, username) {
    currentReceiverId = userId;
    document.getElementById('receiver-id').value = userId;
    document.getElementById('receiver-name').innerText = username;

    // Fetch and display messages for the selected user
    fetch(`/api/messages/?receiver=${userId}`)
        .then(response => response.json())
        .then(data => {
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = '';
            const loggedInUser = '{{ request.user.username }}';
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
        });
}

function sendMessage(event) {
    event.preventDefault();
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value;
    const receiverId = document.getElementById('receiver-id').value;

    if (message && receiverId) {
        ws.send(JSON.stringify({
            'message': message,
            'receiver_id': receiverId
        }));
        messageInput.value = '';
    }
}

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    const chatMessages = document.getElementById('chat-messages');
    const loggedInUser = '{{ request.user.username }}';
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
};