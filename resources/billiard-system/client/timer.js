import * as alt from 'alt-client';
class KDDTimer {
    constructor() { }
    everyTick(func) {
        const id = alt.everyTick(func);
        return id;
    }
    setInterval(func, duration) {
        const id = alt.setInterval(func, duration);
        return id;
    }
    setTimeout(func, duration) {
        const id = alt.setTimeout(func, duration);
        return id;
    }
    clearEveryTick(ref) {
        alt.clearEveryTick(ref);
    }
    clearInterval(ref) {
        alt.clearInterval(ref);
    }
    clearTimeout(ref) {
        alt.clearTimeout(ref);
    }
}
export const Timer = new KDDTimer();
