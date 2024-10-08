import * as alt from 'alt-client';
import { IPlayerBilliardSystem } from "./billiard";

declare module "alt-client" {
    export interface Player {
        billiardSystem : IPlayerBilliardSystem
    }
}