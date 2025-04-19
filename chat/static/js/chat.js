let ws = new WebSocket((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host + '/ws/chat/');
let selectedReceiverId = null;

ws.onmessage = function(event) {
    const data = JSON.parse(event.data);
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = data.sender === '{{ user.username }}' ? 'text-right mb-2' : 'text-left mb-2';
    messageDiv.innerHTML = `
        <div class="inline-block p-2 rounded-lg ${data.sender === '{{ user.username }}' ? 'bg-green-100' : 'bg-white'}">
            <p class="text-sm">${data.message}</p>
            <p class="text-xs text-gray-500">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
};

function selectUser(userId, username) {
    selectedReceiverId = userId;
    document.getElementById('receiver-id').value = userId;
    document.getElementById('receiver-name').textContent = username;
    document.getElementById('message-input').disabled = false;
}

function sendMessage(event) {
    event.preventDefault();
    if (!selectedReceiverId) {
        alert('Please select a user to chat with.');
        return;
    }
    const messageInput = document.getElementById('message-input');
    const message = messageInput.value;
    if (message.trim() === '') return;
    ws.send(JSON.stringify({
        'message': message,
        'receiver_id': selectedReceiverId
    }));
    messageInput.value = '';
}