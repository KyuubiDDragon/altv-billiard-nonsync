import * as alt from 'alt-client';
import * as natives from 'natives';
import { Timer } from './timer.js';

export function disableControlActions(actions: number[]): void {
    actions.forEach(action => {
        natives.disableControlAction(0, action, true);
    });
}

export function drawText3D(text: string, position: alt.Vector3, scale: number, r: number, g: number, b: number, a: number, outline: boolean, center: boolean): void {
    // Implementiere die Funktion zum Zeichnen von 3D-Text
    // Dies ist eine Platzhalterimplementierung
    natives.beginTextCommandDisplayText("STRING");
    natives.addTextComponentSubstringPlayerName(text);
    natives.endTextCommandDisplayText(position.x, position.y, scale);
}

export function getAimingPoint(): { hit: boolean; endCoords: alt.Vector3; surfaceNormal: alt.Vector3; material: number; entityHit: number } {
    // Implementiere die Funktion zum Abrufen des Ziels
    // Dies ist eine Platzhalterimplementierung
    return { hit: false, endCoords: new alt.Vector3(0, 0, 0), surfaceNormal: new alt.Vector3(0, 0, 0), material: 0, entityHit: 0 };
}

export function loadModel( model : number|string ) : Promise<boolean> {
    return new Promise( ( resolve ) => {
        if( typeof model === 'string' )
            model = alt.hash( model );

        if( natives.hasModelLoaded( model ) )
            return resolve( true );

        if( !natives.isModelValid( model ) )
            return resolve( false );

        natives.requestModel( model );

        let maxTries = 100;

        const interval = alt.setInterval( () => {
            if( natives.hasModelLoaded( model as number ) ) {
                alt.clearInterval( interval );
                return resolve( true );
            }

            maxTries--;

            if( maxTries == 0 ) {
                alt.clearInterval( interval );
                return resolve( false );
            }
        }, 50 );
    } );
}

export function distanceFromPointToLine(point: alt.Vector3, lineStart: alt.Vector3, lineEnd: alt.Vector3): number {
    const numerator = Math.abs(
        (lineEnd.x - lineStart.x) * (lineStart.y - point.y) -
        (lineStart.x - point.x) * (lineEnd.y - lineStart.y)
    );
    const denominator = Math.sqrt(
        Math.pow(lineEnd.x - lineStart.x, 2) +
        Math.pow(lineEnd.y - lineStart.y, 2)
    );
    return denominator === 0 ? 0 : numerator / denominator;
}

export function isBetween(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
}

export function waitForCreation( entity : alt.Entity|number, duration : number = 3000 ) : Promise<boolean> {
    return new Promise((resolve) => {
        let timeout = Date.now() + duration;

        const timer = Timer.setInterval(() => {
            if(entity instanceof alt.Entity) {
                if(entity && entity.valid && entity.scriptID != 0) {
                    Timer.clearInterval(timer);
                    resolve(true);
                } else if (Date.now() >= timeout) {
                    Timer.clearInterval(timer);
                    resolve(false);
                }
            } else if( typeof entity == 'number') {
                if(natives.doesEntityExist(entity)) {
                    Timer.clearInterval(timer);
                    resolve(true);
                } else if (Date.now() >= timeout) {
                    Timer.clearInterval(timer);
                    resolve(false);
                }
            }
        }, 50);
    });
}