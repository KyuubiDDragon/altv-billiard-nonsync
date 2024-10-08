import * as alt from 'alt-client';
import * as natives from 'natives';
import { Timer } from './timer.js';
import { loadModel, waitForCreation } from './utils.js';
class BilliardSystem {
    billiardTable = null;
    billiardBalls = [];
    isPlaying = false;
    cueObject = null;
    camera = null;
    power = 0;
    pockets = [];
    cueBallStartingPosition = null;
    shotDirection = null;
    tickInterval = null;
    constructor() {
        alt.log(`[BilliardSystem] Started`);
        if (!alt.Player.local.billiardSystem)
            alt.Player.local.billiardSystem = {};
        alt.onServer('spawnBilliardTable', this.spawnBilliardTable.bind(this));
        alt.onServer('cancelB', this.cancelB.bind(this));
        alt.on("streamSyncedMetaChange", this.onStreamSyncedMetaChange.bind(this));
        alt.on("gameEntityDestroy", this.onGameEntityDestroy.bind(this));
        alt.on("gameEntityCreate", this.onGameEntityCreate.bind(this));
        this.tickInterval = Timer.everyTick(this.everySecond.bind(this));
    }
    onGameEntityCreate(entity) {
        const keys = entity.getStreamSyncedMetaKeys();
        for (const key of keys) {
            this.handleStreamSyncedMeta(entity, key, entity.getStreamSyncedMeta(key));
        }
    }
    onGameEntityDestroy(entity) {
        if (entity instanceof alt.Player) {
            if (entity.billiardSystem && entity.billiardSystem.cue)
                this.detachBilliardCue(entity);
        }
    }
    onStreamSyncedMetaChange(entity, key, value) {
        this.handleStreamSyncedMeta(entity, key, value);
    }
    async handleStreamSyncedMeta(entity, key, value) {
        if (entity instanceof alt.Player) {
            let spawned = await waitForCreation(entity);
            if (!spawned)
                return;
            if (!entity.billiardSystem) {
                entity.billiardSystem = {};
            }
            entity.billiardSystem.loading = false;
            switch (key) {
                case "billiardSystem:cue":
                    if (value) {
                        this.attachBilliardCue(entity);
                    }
                    else {
                        this.detachBilliardCue(entity);
                    }
                    break;
                default:
                    break;
            }
        }
    }
    detachBilliardCue(player) {
        player.billiardSystem.loading = false;
        if (player.billiardSystem.cue) {
            if (natives.doesEntityExist(player.billiardSystem.cue)) {
                natives.deleteObject(player.billiardSystem.cue);
            }
        }
    }
    async attachBilliardCue(player) {
        if (!player.billiardSystem || player.billiardSystem.loading || player.billiardSystem.cue)
            return;
        const cueModel = natives.getHashKey('prop_pool_cue');
        await loadModel(cueModel);
        this.cueObject = natives.createObject(cueModel, 0, 0, 0, true, true, false);
        natives.attachEntityToEntity(this.cueObject, alt.Player.local.scriptID, natives.getPedBoneIndex(player, 57005), 0.1, 0, 0, 0, 0, -90, false, false, false, false, 2, true, 0);
    }
    async spawnBilliardTable() {
        const playerPed = alt.Player.local.scriptID;
        const playerPos = natives.getEntityCoords(playerPed, true);
        const heading = natives.getEntityHeading(playerPed);
        const forwardVector = this.getForwardVector(heading);
        const tablePos = new alt.Vector3(playerPos.x + forwardVector.x * 2, playerPos.y + forwardVector.y * 2, playerPos.z - 1);
        const tableModel = natives.getHashKey('prop_pooltable_02');
        await loadModel(tableModel);
        this.billiardTable = natives.createObject(tableModel, tablePos.x, tablePos.y, tablePos.z, false, false, false);
        natives.setEntityHeading(this.billiardTable, heading);
        this.spawnBilliardBalls(tablePos, heading);
        this.definePockets(tablePos, heading);
        alt.log('Billiardtisch und Kugeln wurden erstellt.');
    }
    getForwardVector(heading) {
        const rad = (heading * Math.PI) / 180;
        return new alt.Vector3(-Math.sin(rad), Math.cos(rad), 0);
    }
    async spawnBilliardBalls(tablePos, tableHeading) {
        const ballModels = [];
        for (let i = 1; i <= 15; i++) {
            ballModels.push(`prop_poolball_${i}`);
        }
        ballModels.push('prop_poolball_cue');
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
            natives.setDamping(ball, 0, 0.03);
            natives.setDamping(ball, 1, 0.03);
            this.billiardBalls.push({
                entity: ball,
                model: modelName,
                ballText: index < 15 ? `Kugel mit der Nummer ${index + 1} versenkt` : `Weiße Kugel versenkt`,
                startPosition: new alt.Vector3(ballPos.x, ballPos.y, ballPos.z)
            });
        }
    }
    getBallPositions(tablePos, tableHeading) {
        const positions = [];
        const startX = tablePos.x;
        const startY = tablePos.y;
        const triangleRows = [
            [0.03],
            [-0.06, 0.06],
            [-0.09, 0, 0.09],
            [-0.12, -0.06, 0.06, 0.12],
            [-0.15, -0.09, 0, 0.09, 0.15]
        ];
        const forwardVector = this.getForwardVector(tableHeading);
        const rightVector = new alt.Vector3(-forwardVector.y, forwardVector.x, 0);
        const tableHeight = tablePos.z + 0.75;
        triangleRows.forEach((row, rowIndex) => {
            row.forEach(offset => {
                const posX = startX + forwardVector.x * (0.8 + rowIndex * 0.055) + rightVector.x * offset;
                const posY = startY + forwardVector.y * (0.8 + rowIndex * 0.055) + rightVector.y * offset;
                const posZ = tableHeight;
                positions.push(new alt.Vector3(posX, posY, posZ));
            });
        });
        const cueBallPos = new alt.Vector3(startX - forwardVector.x * 0.45, startY - forwardVector.y * 0.6, tableHeight);
        positions.push(cueBallPos);
        this.cueBallStartingPosition = new alt.Vector3(cueBallPos.x, cueBallPos.y, cueBallPos.z);
        return positions;
    }
    definePockets(tablePos, tableHeading) {
        const pocketOffsets = [
            { x: -0.685, y: -1.20 },
            { x: -0.715, y: 0.12 },
            { x: 0.835, y: -1.20 },
            { x: -0.70, y: 1.47 },
            { x: 0.87, y: 0.12 },
            { x: 0.835, y: 1.47 }
        ];
        const forwardVector = this.getForwardVector(tableHeading);
        const rightVector = new alt.Vector3(-forwardVector.y, forwardVector.x, 0);
        this.pockets = pocketOffsets.map(offset => new alt.Vector3(tablePos.x + forwardVector.x * offset.y + rightVector.x * offset.x, tablePos.y + forwardVector.y * offset.y + rightVector.y * offset.x, tablePos.z + 0.9));
    }
    getCamDirection() {
        const camRot = natives.getGameplayCamRot(2);
        const camHeading = camRot.z * (Math.PI / 180);
        return new alt.Vector3(-Math.sin(camHeading), Math.cos(camHeading), 0);
    }
    drawTrajectory() {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj)
            return;
        const cueBall = cueBallObj.entity;
        const ballPos = natives.getEntityCoords(cueBall, true);
        const direction = this.getCamDirection();
        const start = new alt.Vector3(ballPos.x, ballPos.y, ballPos.z + 0.02);
        const end = new alt.Vector3(start.x + (direction.x * 5), start.y + (direction.y * 5), start.z);
        const dirVector = new alt.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
        const length = Math.sqrt(dirVector.x ** 2 + dirVector.y ** 2);
        this.shotDirection = {
            x: dirVector.x / length,
            y: dirVector.y / length,
            z: 0
        };
        natives.drawLine(start.x, start.y, start.z, end.x, end.y, end.z, 255, 0, 0, 255);
    }
    hitBall() {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj)
            return;
        const cueBall = cueBallObj.entity;
        if (!this.shotDirection)
            return;
        const velocityFactor = this.power / 4;
        const velocityVector = new alt.Vector3(this.shotDirection.x * velocityFactor, this.shotDirection.y * velocityFactor, 0);
        natives.setEntityVelocity(cueBall, velocityVector.x, velocityVector.y, velocityVector.z);
        const angularVelocityVector = new alt.Vector3(this.shotDirection.y * velocityFactor * 0.1, -this.shotDirection.x * velocityFactor * 0.1, 0);
        natives.setEntityAngularVelocity(cueBall, angularVelocityVector.x, angularVelocityVector.y, angularVelocityVector.z);
        this.billiardBalls.forEach(ballObj => {
            natives.setDamping(ballObj.entity, 0, 0);
            natives.setDamping(ballObj.entity, 1, 0);
        });
        alt.setTimeout(() => {
            this.billiardBalls.forEach(ballObj => {
                natives.setDamping(ballObj.entity, 0, 0.03);
                natives.setDamping(ballObj.entity, 1, 0.03);
            });
        }, 2000);
        this.power = 0;
        natives.clearPedTasksImmediately(alt.Player.local.scriptID);
        this.endPlaying();
    }
    checkBallPocketed() {
        for (let i = this.billiardBalls.length - 1; i >= 0; i--) {
            const ballObj = this.billiardBalls[i];
            const ball = ballObj.entity;
            if (!natives.doesEntityExist(ball))
                continue;
            const ballPos = natives.getEntityCoords(ball, true);
            for (const pocket of this.pockets) {
                const distance = natives.getDistanceBetweenCoords(ballPos.x, ballPos.y, ballPos.z, pocket.x, pocket.y, pocket.z, true);
                if (distance < 0.1) {
                    if (ballObj.model === 'prop_poolball_cue') {
                        this.resetCueBall();
                    }
                    else {
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
    resetCueBall() {
        const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
        if (!cueBallObj)
            return;
        const cueBall = cueBallObj.entity;
        if (!this.cueBallStartingPosition)
            return;
        natives.setEntityCoords(cueBall, this.cueBallStartingPosition.x, this.cueBallStartingPosition.y, this.cueBallStartingPosition.z, false, false, false, true);
        natives.setEntityVelocity(cueBall, 0, 0, 0);
        natives.freezeEntityPosition(cueBall, false);
        natives.beginTextCommandPrint('STRING');
        natives.addTextComponentSubstringPlayerName('Weiße Kugel wurde zurückgesetzt.');
        natives.endTextCommandPrint(2000, true);
        alt.log('Weiße Kugel wurde zurückgesetzt.');
    }
    checkBallsOutOfTable() {
        if (!this.billiardTable)
            return;
        const tablePos = natives.getEntityCoords(this.billiardTable, true);
        const tableHeading = natives.getEntityHeading(this.billiardTable);
        this.billiardBalls.forEach(ballObj => {
            const ball = ballObj.entity;
            if (!natives.doesEntityExist(ball))
                return;
            const ballPos = natives.getEntityCoords(ball, true);
            if (!this.isBallOnTable(ballPos, tablePos, tableHeading)) {
                this.resetBall(ballObj);
            }
        });
    }
    isBallOnTable(ballPos, tablePos, tableHeading) {
        const dx = ballPos.x - tablePos.x;
        const dy = ballPos.y - tablePos.y;
        const rad = -tableHeading * (Math.PI / 180);
        const localX = dx * Math.cos(rad) - dy * Math.sin(rad);
        const localY = dx * Math.sin(rad) + dy * Math.cos(rad);
        return (localX >= -0.90 &&
            localX <= 0.90 &&
            localY >= -1.55 &&
            localY <= 1.55);
    }
    resetBall(ballObj) {
        const ball = ballObj.entity;
        const startPos = ballObj.startPosition;
        natives.setEntityCoords(ball, startPos.x, startPos.y, startPos.z, false, false, false, true);
        natives.setEntityVelocity(ball, 0, 0, 0);
        natives.freezeEntityPosition(ball, false);
        natives.beginTextCommandPrint('STRING');
        natives.addTextComponentSubstringPlayerName(`Kugel ${ballObj.model} wurde zurückgesetzt.`);
        natives.endTextCommandPrint(2000, true);
        alt.log(`Kugel ${ballObj.model} wurde zurückgesetzt.`);
    }
    drawTableBounds() {
        if (!this.billiardTable)
            return;
        const tablePos = natives.getEntityCoords(this.billiardTable, true);
        const tableHeading = natives.getEntityHeading(this.billiardTable);
        const corners = [
            { x: -0.90, y: -1.55 },
            { x: 0.90, y: -1.55 },
            { x: 0.90, y: 1.55 },
            { x: -0.90, y: 1.55 },
            { x: -0.90, y: -1.55 }
        ];
        const rad = (tableHeading * Math.PI) / 180;
    }
    endPlaying() {
        this.isPlaying = false;
        alt.setTimeout(() => {
            natives.renderScriptCams(false, false, 0, true, false, 0);
            if (this.camera) {
                natives.destroyCam(this.camera, false);
                this.camera = null;
            }
        }, 3000);
        if (this.cueObject) {
            natives.deleteObject(this.cueObject);
            this.cueObject = null;
        }
        natives.clearPedTasksImmediately(alt.Player.local.scriptID);
        alt.log('Spiel beendet.');
    }
    cancelB() {
        this.endPlaying();
    }
    everySecond() {
        if (!this.billiardTable)
            return;
        const playerPed = alt.Player.local.scriptID;
        const playerPos = natives.getEntityCoords(playerPed, true);
        const tablePos = natives.getEntityCoords(this.billiardTable, true);
        const distance = natives.getDistanceBetweenCoords(playerPos.x, playerPos.y, playerPos.z, tablePos.x, tablePos.y, tablePos.z, true);
        if (distance < 3 && !this.isPlaying) {
            natives.beginTextCommandDisplayHelp('STRING');
            natives.addTextComponentSubstringPlayerName('Drücke ~INPUT_CONTEXT~, um Billiard zu spielen.');
            natives.endTextCommandDisplayHelp(0, false, true, -1);
            if (natives.isControlJustPressed(0, 51)) {
                this.startPlaying();
            }
        }
        this.checkBallPocketed();
        this.checkBallsOutOfTable();
        if (this.isPlaying) {
            natives.disableAllControlActions(0);
            natives.enableControlAction(0, 1, true);
            natives.enableControlAction(0, 2, true);
            natives.enableControlAction(0, 22, true);
            this.drawTrajectory();
            if (natives.isControlPressed(0, 22)) {
                if (this.power < 100)
                    this.power += 1;
                natives.drawRect(0.5, 0.9, 0.2, 0.02, 0, 0, 0, 150, false);
                natives.drawRect(0.4, 0.9, this.power / 500, 0.02, 0, 255, 0, 200, false);
            }
            else if (natives.isControlJustReleased(0, 22)) {
                this.hitBall();
            }
        }
        if (this.isPlaying) {
            const cueBallObj = this.billiardBalls.find(ball => ball.model === 'prop_poolball_cue');
            if (cueBallObj) {
                const cueBall = cueBallObj.entity;
                const velocity = natives.getEntityVelocity(cueBall);
                alt.log(`Cue Ball Velocity: x=${velocity.x.toFixed(3)}, y=${velocity.y.toFixed(3)}, z=${velocity.z.toFixed(3)}`);
            }
        }
        this.drawTableBounds();
    }
    async startPlaying() {
        if (!this.billiardTable)
            return;
        this.isPlaying = true;
        const tablePos = natives.getEntityCoords(this.billiardTable, true);
        this.attachBilliardCue(alt.Player.local);
        this.camera = natives.createCamWithParams('DEFAULT_SCRIPTED_CAMERA', tablePos.x, tablePos.y, tablePos.z + 5, -90.0, 0.0, 0.0, 90.0, false, 0);
        natives.setCamActive(this.camera, true);
        natives.renderScriptCams(true, false, 0, true, false, 0);
        natives.taskStandStill(alt.Player.local.scriptID, -1);
        alt.log('Spiel gestartet.');
    }
    async onInterval() {
    }
}
export default new BilliardSystem();
