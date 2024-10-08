import * as alt from 'alt-client'

class KDDTimer {
    constructor() {}

    everyTick( func: () => void ) : number {
        const id = alt.everyTick(func);

        return id;
    }

    setInterval( func: () => void, duration : number ) : number {
        const id = alt.setInterval(func, duration);

        return id;
    }

    setTimeout( func: () => void, duration : number ) : number {
        const id = alt.setTimeout(func, duration);

        return id;
    }

    clearEveryTick( ref : number ) {
        alt.clearEveryTick(ref);
    }

    clearInterval( ref : number ) {
        alt.clearInterval(ref);
    }

    clearTimeout( ref : number ) {
        alt.clearTimeout(ref);
    }
}

export const Timer = new KDDTimer();