function notify(message, type = 'info') {
    const area = document.getElementById('notification-area');
    if (!area) return;
    const div = document.createElement('div');
    div.className = `notification ${type}`;
    div.textContent = message;
    area.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

function renderChips(container, selectedArr, onRemove) {
    if (!container) return;
    container.innerHTML = '';
    selectedArr.forEach(name => {
        const chip = document.createElement('span');
        chip.className = 'player-chip';
        chip.innerHTML = `${name} <span class="remove-chip" data-id="${name}">×</span>`;
        chip.querySelector('.remove-chip').addEventListener('click', () => onRemove(name));
        container.appendChild(chip);
    });
}

function renderList(players, container, btnClass, btnText, emptyText) {
    if (!container) return;
    container.innerHTML = '';
    if (players.length === 0) {
        container.innerHTML = `<div class="dim text-center">${emptyText}</div>`;
        return;
    }
    players.forEach(p => {
        const div = document.createElement('div');
        div.className = 'player-item';
        const name = typeof p === 'string' ? p : p.name;
        div.innerHTML = `<span>${name}</span><button class="btn btn-sm ${btnClass}" data-id="${name}">${btnText}</button>`;
        container.appendChild(div);
    });
}