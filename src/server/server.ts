import * as alt from 'alt-server';

alt.on('consoleCommand', (command) => {
    if (command === 'startb') {
        const player = alt.Player.all[0];
        alt.log(player.socialClubName);
        if (player) {
            alt.emitClient(player, 'spawnBilliardTable');
            alt.log('Billiard-Spiel gestartet.');
        }
        else {
            alt.log('Kein Spieler verfügbar, um das Spiel zu starten.');
        }
    }
    if(command === 'cancel'){
        const player = alt.Player.all[0];
        alt.log(player.socialClubName);
        if (player) {
            alt.emitClient(player, 'cancelb');
            alt.log('Billiard-Spiel gestartet.');
        }
    }
});

