
const players = [
    { name: "Christian McCaffrey", position: "RB" },
    { name: "Justin Jefferson", position: "WR" },
    { name: "Patrick Mahomes", position: "QB" },
    { name: "Travis Kelce", position: "TE" },
    { name: "Austin Ekeler", position: "RB" },
];

const playerList = document.getElementById('players');
const roster = document.getElementById('roster');

function loadPlayers() {
    playerList.innerHTML = '';
    players.forEach((player, index) => {
        const li = document.createElement('li');
        li.textContent = `${player.name} - ${player.position}`;
        li.addEventListener('click', () => {
            draftPlayer(index);
        });
        playerList.appendChild(li);
    });
}

function draftPlayer(index) {
    const player = players[index];
    const li = document.createElement('li');
    li.textContent = `${player.name} - ${player.position}`;
    roster.appendChild(li);
    players.splice(index, 1);
    loadPlayers();
}

function showPage(id) {
    // Hide all sections
    document.querySelectorAll("main section").forEach(sec => sec.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
    // Remove active class from all menu items
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    // Add active class to the clicked menu item
    document.querySelectorAll('.menu-item').forEach(item => {
        if (item.getAttribute('onclick').includes(id)) {
            item.classList.add('active');
        }
    });
    // If it's the draft page, load players
    if (id === 'draft') loadPlayers();
    if (id === 'player-news') loadPlayerNews();

}


const toggleButton = document.getElementById('toggleSidebar');
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('overlay');
const contentWrapper = document.getElementById('content-wrapper');

toggleButton.addEventListener('click', () => {
    sidebar.classList.toggle('visible');
    toggleButton.classList.toggle('open');
    overlay.classList.toggle('visible');
    contentWrapper.classList.toggle('blurred');
});

// Also close sidebar if clicking outside (overlay click)
overlay.addEventListener('click', () => {
    sidebar.classList.remove('visible');
    toggleButton.classList.remove('open');
    overlay.classList.remove('visible');
    contentWrapper.classList.remove('blurred');
});

// Close sidebar when clicking menu items too
const menuItems = document.querySelectorAll('.menu-item');
menuItems.forEach(item => {
    item.addEventListener('click', () => {
        sidebar.classList.remove('visible');
        toggleButton.classList.remove('open');
        overlay.classList.remove('visible');
        contentWrapper.classList.remove('blurred');
    });
});

function loadPlayerNews() {
    const newsList = document.getElementById('news-list');
    newsList.innerHTML = '<li>Loading news...</li>'; // Show a loading message

    fetch('news.json')
    .then(response => response.json())
    .then(data => {
        const newsList = document.getElementById('news-list');
        newsList.innerHTML = '';

        data.articles.forEach(item => {
            const li = document.createElement('li');
            li.classList.add('news-card');
            li.innerHTML = `<strong>${item.title}</strong><br>${item.body}`;
            newsList.appendChild(li);
        });
    })
    .catch(error => {
        console.error('Error fetching player news:', error);
        document.getElementById('news-list').innerHTML = '<li>Failed to load news.</li>';
    });

}




showPage('home');
