// Importiere benötigte Module
import * as alt from 'alt-client';
import * as natives from 'natives';
import { Timer } from './timer.js';
import { loadModel, waitForCreation } from './utils.js';


// Typen und Interfaces
interface BilliardBall {
    entity: number;
    model: string;
    ballText: string;
    startPosition?: alt.Vector3;
}

interface IStreamSyncedMeta {
    key: string;
    value: any;
}


// Hauptklasse für das Billiard-System
class BilliardSystem {
    private billiardTable: number | null = null;
    private billiardBalls: BilliardBall[] = [];
    private isPlaying: boolean = false;
    private cueObject: number | null = null;
    private camera: number | null = null;
    private power: number = 0;
    private pockets: alt.Vector3[] = [];
    private cueBallStartingPosition: alt.Vector3 | null = null;
    private shotDirection: { x: number; y: number; z: number } | null = null;
    private tickInterval: number | null = null;

    constructor() {
        alt.log(`[BilliardSystem] Started`);
        if( !alt.Player.local.billiardSystem )
            alt.Player.local.billiardSystem = {}

        // Binde Ereignisse
        alt.onServer('spawnBilliardTable', this.spawnBilliardTable.bind(this));
        alt.onServer('cancelB', this.cancelB.bind(this));

        alt.on( "streamSyncedMetaChange",  this.onStreamSyncedMetaChange.bind( this ) );
        alt.on( "gameEntityDestroy",  this.onGameEntityDestroy.bind( this ) );
        alt.on( "gameEntityCreate",  this.onGameEntityCreate.bind( this ) );
        

        // Starte regelmäßige Überprüfungen
        this.tickInterval = Timer.everyTick(this.everySecond.bind(this));
    }

    onGameEntityCreate( entity : alt.Entity ) {
        const keys = entity.getStreamSyncedMetaKeys();

        for(const key of keys) {
            this.handleStreamSyncedMeta(entity, key, entity.getStreamSyncedMeta(key) as any);
        }
        
    }

    onGameEntityDestroy( entity : alt.Entity ) {
        if( entity instanceof alt.Player ) {
            if( entity.billiardSystem && entity.billiardSystem.cue )
                this.detachBilliardCue( entity );
        }
    }

    onStreamSyncedMetaChange( entity : alt.Entity, key : string, value : any ) {
        this.handleStreamSyncedMeta(entity, key, value);
    }


    async handleStreamSyncedMeta(entity: alt.Entity, key: string, value: any) {
        if (entity instanceof alt.Player) {
            let spawned = await waitForCreation(entity); 

            if (!spawned) return;

            if (!entity.billiardSystem) {
                entity.billiardSystem = {}; 
            }

            entity.billiardSystem.loading = false;

            switch (key) {
                case "billiardSystem:cue":
                    if (value) {
                        this.attachBilliardCue(entity); 
                    } else {
                        this.detachBilliardCue(entity); 
                    }
                    break;
                // Weitere Fälle für andere Metadaten können hier hinzugefügt werden
                default:
                    break; 
            }
        } 
    }

    detachBilliardCue( player : alt.Player ) {
        player.billiardSystem.loading = false;


        if( player.billiardSystem.cue ) {
            if( natives.doesEntityExist( player.billiardSystem.cue ) ) {
                natives.deleteObject( player.billiardSystem.cue );
            }
        }
    }

    async attachBilliardCue( player : alt.Player){
        if( !player.billiardSystem || player.billiardSystem.loading || player.billiardSystem.cue  )
            return;

        const cueModel = natives.getHashKey('prop_pool_cue');
        await loadModel(cueModel);

        this.cueObject = natives.createObject(cueModel, 0, 0, 0, true, true, false);
        natives.attachEntityToEntity(
            this.cueObject,
            alt.Player.local.scriptID,
            natives.getPedBoneIndex(player, 57005),
            0.1, 0, 0,
            0, 0, -90,
            false, false, false, false, 2, true, 0
        );
    }

    /**
     * Spawnt den Billiardtisch im Spiel.
     */
    async spawnBilliardTable(): Promise<void> {
        const playerPed = alt.Player.local.scriptID;
        const playerPos = natives.getEntityCoords(playerPed, true) as alt.Vector3;
        const heading = natives.getEntityHeading(playerPed);
        const forwardVector = this.getForwardVector(heading);

        const tablePos: alt.Vector3 = new alt.Vector3(
            playerPos.x + forwardVector.x * 2,
            playerPos.y + forwardVector.y * 2,
            playerPos.z - 1
        );

        const tableModel = natives.getHashKey('prop_pooltable_02');
        await loadModel(tableModel);

        this.billiardTable = natives.createObject(tableModel, tablePos.x, tablePos.y, tablePos.z, false, false, false);
        natives.setEntityHeading(this.billiardTable, heading);

        this.spawnBilliardBalls(tablePos, heading);
        this.definePockets(tablePos, heading);

        alt.log('Billiardtisch und Kugeln wurden erstellt.');
    }

    /**
     * Berechnet den Vorwärtsvektor basierend auf dem Heading.
     * @param heading Der Heading-Wert.
     * @returns Ein normalisierter Vektor.
     */
    getForwardVector(heading: number): alt.Vector3 {
        const rad = (heading * Math.PI) / 180;
        return new alt.Vector3(
            -Math.sin(rad),
            Math.cos(rad),
            0
        );
    }

    /**
     * Spawnt die Billiard-Kugeln auf dem Tisch.
     * @param tablePos Position des Tisches.
     * @param tableHeading Ausrichtung des Tisches.
     */
    async spawnBilliardBalls(tablePos: alt.Vector3, tableHeading: number): Promise<void> {
        const ballModels: string[] = [];

        for (let i = 1; i <= 15; i++) {
            ballModels.push(`prop_poolball_${i}`);
        }
        ballModels.push('prop_poolball_cue'); // Weiße Kugel

        const ballPositions = this.getBallPositions(tablePos, tableHeading);

        for (let index = 0; index < ballModels.length; index++) {
            const modelName = ballModels[index];
            const modelHash = natives.getHashKey(modelName);
            await loadModel(modelHash);

            const ballPos = ballPositions[index];

            const ball = natives.createObject(modelHash, ballPos.x, ballPos.y, ballPos.z + 0.2, false, false, false);
            natives.setEntityDynamic(ball, true);
            natives.setEntityCollision(ball, true, true);
            natives.setEntityHasGravity(ball, true);

            // Dämpfung entfernen
            natives.setDamping(ball, 0, 0.03); // Lineare Dämpfung
            natives.setDamping(ball, 1, 0.03); // Rotationsdämpfung



            // Startposition speichern
            this.billiardBalls.push({
                entity: ball,
                model: modelName,
                ballText: index < 15 ? `Kugel mit der Nummer ${index + 1} versenkt` : `Weiße Kugel versenkt`,
                startPosition: new alt.Vector3(ballPos.x, ballPos.y, ballPos.z)
            });
            
        }
    }

    /**
     * Berechnet die Startpositionen der Kugeln.
     * @param tablePos Position des Tisches.
     * @param tableHeading Ausrichtung des Tisches.
     * @returns Array von Positionen für die Kugeln.
     */
    getBallPositions(tablePos: alt.Vector3, tableHeading: number): alt.Vector3[] {
        const positions: alt.Vector3[] = [];
        const startX = tablePos.x;
        const startY = tablePos.y;

        const triangleRows: number[][] = [
            [0.03],
            [-0.06, 0.06],
            [-0.09, 0, 0.09],
            [-0.12, -0.06, 0.06, 0.12],
            [-0.15, -0.09, 0, 0.09, 0.15]
        ];

        const forwardVector = this.getForwardVector(tableHeading);
        const rightVector: alt.Vector3 = new alt.Vector3(
            -forwardVector.y,
            forwardVector.x,
            0
        );

        const tableHeight = tablePos.z + 0.75; // Angepasste Höhe der Tischoberfläche

        triangleRows.forEach((row, rowIndex) => {
            row.forEach(offset => {
                const posX = startX + forwardVector.x * (0.8 + rowIndex * 0.055) + rightVector.x * offset;
                const posY = startY + forwardVector.y * (0.8 + rowIndex * 0.055) + rightVector.y * offset;
                const posZ = tableHeight;

                positions.push(new alt.Vector3(posX, posY, posZ));
            });
        });

        const cueBallPos: alt.Vector3 = new alt.Vector3(
            startX - forwardVector.x * 0.45,
            startY - forwardVector.y * 0.6,
            tableHeight
        );
        positions.push(cueBallPos);

        this.cueBallStartingPosition = new alt.Vector3(cueBallPos.x, cueBallPos.y, cueBallPos.z);


        return positions;
    }

    /**
     * Definiert die Taschen des Tisches.
     * @param tablePos Position des Tisches.
     * @param tableHeading Ausrichtung des Tisches.
     */
    definePockets(tablePos: alt.Vector3, tableHeading: number): void {
        const pocketOffsets: { x: number; y: number }[] = [
            { x: -0.685, y: -1.20 },
            { x: -0.715, y: 0.12 },
            { x: 0.835, y: -1.20 },
            { x: -0.70, y: 1.47 },
            { x: 0.87, y: 0.12 },
            { x: 0.835, y: 1.47 }
        ];

        const forwardVector = this.getForwardVector(tableHeading);
        const rightVector: alt.Vector3 = new alt.Vector3(
            -forwardVector.y,
            forwardVector.x,
            0
        );

        this.pockets = pocketOffsets.map(offset => new alt.Vector3(
            tablePos.x + forwardVector.x * offset.y + rightVector.x * offset.x,
            tablePos.y + forwardVector.y * offset.y + rightVector.y * offset.x,
            tablePos.z + 0.9
        ));
        
    }

    /**
     * Holt die Richtung der Kamera.
     * @returns Vektor der Kamerarichtung.
     */
    getCamDirection(): alt.Vector3 {
        const camRot = natives.getGameplayCamRot(2);
        const camHeading = camRot.z * (Math.PI / 180);

        return new alt.Vector3(
            -Math.sin(camHeading),
            Math.cos(camHeading),
            0
        );
    }

    /**
     * Zeichnet die Flugbahn der Kugel.
     */
    drawTrajectory(): void {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj) return;
        const cueBall = cueBallObj.entity;
        const ballPos = natives.getEntityCoords(cueBall, true) as alt.Vector3;

        const direction = this.getCamDirection();

        const start: alt.Vector3 = new alt.Vector3(
            ballPos.x,
            ballPos.y,
            ballPos.z + 0.02
        );

        const end: alt.Vector3 = new alt.Vector3(
            start.x + (direction.x * 5),
            start.y + (direction.y * 5),
            start.z // Z bleibt gleich für eine horizontale Linie
        );

        // Richtungsvektor berechnen und normalisieren
        const dirVector = new alt.Vector3(
            end.x - start.x,
            end.y - start.y,
            end.z - start.z
        );
        const length = Math.sqrt(dirVector.x ** 2 + dirVector.y ** 2); // Nur x und y
        this.shotDirection = {
            x: dirVector.x / length,
            y: dirVector.y / length,
            z: 0 // Z-Komponente auf 0 setzen
        };

        natives.drawLine(
            start.x, start.y, start.z,
            end.x, end.y, end.z,
            255, 0, 0, 255
        );
    }

    /**
     * Stoßt die weiße Kugel an.
     */
    hitBall(): void {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj) return;
        const cueBall = cueBallObj.entity;
    
        if (!this.shotDirection) return; // Überprüfen, ob die Richtung verfügbar ist
    
        const velocityFactor = this.power / 4; // Kraft erhöhen
    
        const velocityVector = new alt.Vector3(
            this.shotDirection.x * velocityFactor,
            this.shotDirection.y * velocityFactor,
            0
        );
    
        natives.setEntityVelocity(cueBall, velocityVector.x, velocityVector.y, velocityVector.z);
    
        // Setze die Drehgeschwindigkeit basierend auf der Stoßstärke und Richtung
        const angularVelocityVector = new alt.Vector3(
            this.shotDirection.y * velocityFactor * 0.1, // Beispielwert, anpassen nach Bedarf
            -this.shotDirection.x * velocityFactor * 0.1,
            0
        );
        natives.setEntityAngularVelocity(cueBall, angularVelocityVector.x, angularVelocityVector.y, angularVelocityVector.z);
    
        // Temporäre Dämpfung setzen
        this.billiardBalls.forEach(ballObj => {
            natives.setDamping(ballObj.entity, 0, 0); // Lineare Dämpfung auf 0 setzen
            natives.setDamping(ballObj.entity, 1, 0); // Rotationsdämpfung auf 0 setzen
        });
    
        // Timer setzen, um die Dämpfung nach 2 Sekunden zurückzusetzen
        alt.setTimeout(() => {
            this.billiardBalls.forEach(ballObj => {
                natives.setDamping(ballObj.entity, 0, 0.03); // Lineare Dämpfung zurücksetzen
                natives.setDamping(ballObj.entity, 1, 0.03); // Rotationsdämpfung zurücksetzen
            });
        }, 2000); // 2000 Millisekunden = 2 Sekunden
    
        this.power = 0;
    
        // Spieler wieder bewegen lassen
        natives.clearPedTasksImmediately(alt.Player.local.scriptID);
    
        this.endPlaying();
    }
    
    

    /**
     * Überprüft, ob Kugeln in die Taschen gefallen sind.
     */
    checkBallPocketed(): void {
        for (let i = this.billiardBalls.length - 1; i >= 0; i--) {
            const ballObj = this.billiardBalls[i];
            const ball = ballObj.entity;
            if (!natives.doesEntityExist(ball)) continue;

            const ballPos = natives.getEntityCoords(ball, true) as alt.Vector3;

            for (const pocket of this.pockets) {
                const distance = natives.getDistanceBetweenCoords(
                    ballPos.x, ballPos.y, ballPos.z,
                    pocket.x, pocket.y, pocket.z, true
                );
                if (distance < 0.1) {
                    if (ballObj.model === 'prop_poolball_cue') {
                        // Weiße Kugel wurde versenkt, zurücksetzen
                        this.resetCueBall();
                    } else {
                        // Andere Kugel, entfernen
                        natives.deleteObject(ball);
                        this.billiardBalls.splice(i, 1);

                        natives.beginTextCommandPrint('STRING');
                        natives.addTextComponentSubstringPlayerName(`${ballObj.ballText}`);
                        natives.endTextCommandPrint(2000, true);

                        alt.log(`Kugel ${ballObj.model} wurde versenkt.`);
                    }
                    break;
                }
            }
        }
    }

    /**
     * Setzt die weiße Kugel zurück.
     */
    resetCueBall(): void {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj) return;
        const cueBall = cueBallObj.entity;

        if (!this.cueBallStartingPosition) return;

        // Position und Geschwindigkeit zurücksetzen
        natives.setEntityCoords(
            cueBall,
            this.cueBallStartingPosition.x,
            this.cueBallStartingPosition.y,
            this.cueBallStartingPosition.z,
            false, false, false, true
        );
        natives.setEntityVelocity(cueBall, 0, 0, 0);
        natives.freezeEntityPosition(cueBall, false);

        // Nachricht anzeigen
        natives.beginTextCommandPrint('STRING');
        natives.addTextComponentSubstringPlayerName('Weiße Kugel wurde zurückgesetzt.');
        natives.endTextCommandPrint(2000, true);

        alt.log('Weiße Kugel wurde zurückgesetzt.');
    }

    /**
     * Überprüft, ob Kugeln den Tisch verlassen haben.
     */
    checkBallsOutOfTable(): void {
        if (!this.billiardTable) return;

        const tablePos = natives.getEntityCoords(this.billiardTable, true) as alt.Vector3;
        const tableHeading = natives.getEntityHeading(this.billiardTable);

        this.billiardBalls.forEach(ballObj => {
            const ball = ballObj.entity;
            if (!natives.doesEntityExist(ball)) return;

            const ballPos = natives.getEntityCoords(ball, true) as alt.Vector3;

            if (!this.isBallOnTable(ballPos, tablePos, tableHeading)) {
                // Kugel hat den Tischbereich verlassen, zurücksetzen
                this.resetBall(ballObj);
            }
        });
    }

    /**
     * Überprüft, ob eine Kugel auf dem Tisch liegt.
     * @param ballPos Position der Kugel.
     * @param tablePos Position des Tisches.
     * @param tableHeading Ausrichtung des Tisches.
     * @returns Boolean, ob die Kugel auf dem Tisch liegt.
     */
    isBallOnTable(ballPos: alt.Vector3, tablePos: alt.Vector3, tableHeading: number): boolean {
        const dx = ballPos.x - tablePos.x;
        const dy = ballPos.y - tablePos.y;

        const rad = -tableHeading * (Math.PI / 180);

        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);

        return (
            localX >= -0.90 &&
            localX <= 0.90 &&
            localY >= -1.55 &&
            localY <= 1.55
        );
    }

    /**
     * Setzt eine Kugel zurück zur Startposition.
     * @param ballObj Die Kugel, die zurückgesetzt werden soll.
     */
    resetBall(ballObj: BilliardBall): void {
        const ball = ballObj.entity;
        const startPos = ballObj.startPosition;

        // Position und Geschwindigkeit zurücksetzen
        natives.setEntityCoords(
            ball,
            startPos.x,
            startPos.y,
            startPos.z,
            false, false, false, true
        );
        natives.setEntityVelocity(ball, 0, 0, 0);
        natives.freezeEntityPosition(ball, false);

        // Nachricht anzeigen
        natives.beginTextCommandPrint('STRING');
        natives.addTextComponentSubstringPlayerName(`Kugel ${ballObj.model} wurde zurückgesetzt.`);
        natives.endTextCommandPrint(2000, true);

        alt.log(`Kugel ${ballObj.model} wurde zurückgesetzt.`);
    }

    /**
     * Zeichnet die Grenzen des Tisches.
     */
    drawTableBounds(): void {
        if (!this.billiardTable) return;

        const tablePos = natives.getEntityCoords(this.billiardTable, true) as alt.Vector3;
        const tableHeading = natives.getEntityHeading(this.billiardTable);

        const corners: { x: number; y: number }[] = [
            { x: -0.90, y: -1.55 },
            { x: 0.90, y: -1.55 },
            { x: 0.90, y: 1.55 },
            { x: -0.90, y: 1.55 },
            { x: -0.90, y: -1.55 } // Zurück zum ersten Punkt
        ];

        const rad = (tableHeading * Math.PI) / 180;

        /*for (let i = 0; i < corners.length - 1; i++) {
            const start = corners[i];
            const end = corners[i + 1];

            const startX = tablePos.x + (start.x * Math.cos(rad) - start.y * Math.sin(rad));
            const startY = tablePos.y + (start.x * Math.sin(rad) + start.y * Math.cos(rad));

            const endX = tablePos.x + (end.x * Math.cos(rad) - end.y * Math.sin(rad));
            const endY = tablePos.y + (end.x * Math.sin(rad) + end.y * Math.cos(rad));

            natives.drawLine(
                startX, startY, tablePos.z + 0.9,
                endX, endY, tablePos.z + 0.9,
                0, 255, 0, 255
            );
        }*/
    }

    /**
     * Beendet das Spiel.
     */
    endPlaying(): void {
        this.isPlaying = false;

        // Kamera zurücksetzen
        alt.setTimeout(() => {
            natives.renderScriptCams(false, false, 0, true, false, 0);
            if (this.camera) {
                natives.destroyCam(this.camera, false);
                this.camera = null;
            }
        }, 3000);
        

        // Cue entfernen
        if (this.cueObject) {
            natives.deleteObject(this.cueObject);
            this.cueObject = null;
        }

        // Spielerbewegung wieder aktivieren
        natives.clearPedTasksImmediately(alt.Player.local.scriptID);

        alt.log('Spiel beendet.');
    }

    /**
     * Behandelt das Abbrechen des Spiels.
     */
    cancelB(): void {
        this.endPlaying();
    }

    /**
     * Überprüft regelmäßig den Status des Spiels.
     */
    everySecond(): void {
        if (!this.billiardTable) return;

        const playerPed = alt.Player.local.scriptID;
        const playerPos = natives.getEntityCoords(playerPed, true) as alt.Vector3;
        const tablePos = natives.getEntityCoords(this.billiardTable, true) as alt.Vector3;
        const distance = natives.getDistanceBetweenCoords(
            playerPos.x, playerPos.y, playerPos.z,
            tablePos.x, tablePos.y, tablePos.z, true
        );

        if (distance < 3 && !this.isPlaying) {
            natives.beginTextCommandDisplayHelp('STRING');
            natives.addTextComponentSubstringPlayerName('Drücke ~INPUT_CONTEXT~, um Billiard zu spielen.');
            natives.endTextCommandDisplayHelp(0, false, true, -1);

            if (natives.isControlJustPressed(0, 51)) { // 51 entspricht ~INPUT_CONTEXT~
                this.startPlaying();
            }
        }

        this.checkBallPocketed();
        this.checkBallsOutOfTable();

        if (this.isPlaying) {
            natives.disableAllControlActions(0);

            // Steuerungen aktivieren
            natives.enableControlAction(0, 1, true);  // Maus X-Achse
            natives.enableControlAction(0, 2, true);  // Maus Y-Achse
            natives.enableControlAction(0, 22, true); // Leertaste

            this.drawTrajectory();

            if (natives.isControlPressed(0, 22)) { // Leertaste gedrückt
                if (this.power < 100) this.power += 1;
                // Kraftanzeige zeichnen
                natives.drawRect(0.5, 0.9, 0.2, 0.02, 0, 0, 0, 150, false);
                natives.drawRect(0.4, 0.9, this.power / 500, 0.02, 0, 255, 0, 200, false);
            } else if (natives.isControlJustReleased(0, 22)) { // Leertaste losgelassen
                this.hitBall();
            }
        }

        if (this.isPlaying) {
            const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
            if (cueBallObj) {
                const cueBall = cueBallObj.entity;
                const velocity = natives.getEntityVelocity(cueBall) as alt.Vector3;
                alt.log(`Cue Ball Velocity: x=${velocity.x.toFixed(3)}, y=${velocity.y.toFixed(3)}, z=${velocity.z.toFixed(3)}`);
            }
        }

        this.drawTableBounds();
    }

    /**
     * Startet das Spiel.
     */
    async startPlaying(): Promise<void> {
        if (!this.billiardTable) return;

        this.isPlaying = true;

        const tablePos = natives.getEntityCoords(this.billiardTable, true) as alt.Vector3;

        this.attachBilliardCue(alt.Player.local)

        this.camera = natives.createCamWithParams(
            'DEFAULT_SCRIPTED_CAMERA',
            tablePos.x,
            tablePos.y,
            tablePos.z + 5,
            -90.0,
            0.0,
            0.0,
            90.0,
            false,
            0
        );
        natives.setCamActive(this.camera, true);
        natives.renderScriptCams(true, false, 0, true, false, 0);

        // Spielerbewegung einschränken, aber nicht einfrieren
        natives.taskStandStill(alt.Player.local.scriptID, -1);

        alt.log('Spiel gestartet.');
    }

    /**
     * Behandelt die Logik, die jede Sekunde ausgeführt wird.
     */
    async onInterval(): Promise<void> {
        // Diese Funktion ist optional und kann für weitere regelmäßige Überprüfungen verwendet werden
    }
}

// Instanziiere das Billiard-System
export default new BilliardSystem();
