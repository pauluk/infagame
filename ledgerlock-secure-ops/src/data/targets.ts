import type { DoorDef, ExternalDef, PropDef, RoomDef, RoomId, RouteDef } from '../game/types';
import { EXTERNAL_BY_ID, ROOM_BY_ID, ROOMS } from './map';
import { ROUTE_BY_ID } from './routes';

export type TargetKind = 'room' | 'route' | 'prop' | 'reader' | 'ext';
export interface TargetInfo {
  id: string; kind: TargetKind; name: string; desc: string;
  room?: RoomDef; route?: RouteDef; prop?: PropDef; door?: DoorDef; ext?: ExternalDef;
}

const ALL_PROPS = ROOMS.flatMap((r) => r.props);
const ALL_DOORS = ROOMS.flatMap((r) => r.doors);

export const roomTarget = (id: RoomId) => `room:${id}`;
export const routeTarget = (id: string) => `route:${id}`;
export const propTarget = (room: RoomId, key: string) => `prop:${room}.${key}`;
export const readerTarget = (doorId: string) => `reader:${doorId}`;

export function describeTarget(id: string | null | undefined): TargetInfo | null {
  if (!id) return null;
  const idx = id.indexOf(':');
  const kind = id.slice(0, idx) as TargetKind, rest = id.slice(idx + 1);
  switch (kind) {
    case 'room': { const room = ROOM_BY_ID[rest as RoomId]; return room ? { id, kind, name: room.name, desc: room.blurb, room } : null; }
    case 'route': { const route = ROUTE_BY_ID[rest]; return route ? { id, kind, name: route.name, desc: route.desc, route } : null; }
    case 'prop': { const prop = ALL_PROPS.find((p) => p.id === id); return prop ? { id, kind, name: prop.name, desc: prop.desc, prop, room: ROOM_BY_ID[prop.room] } : null; }
    case 'reader': {
      const door = ALL_DOORS.find((d) => d.id === rest); if (!door) return null;
      const room = ROOM_BY_ID[door.room];
      return { id, kind, name: `Access reader: ${room.name}`, desc: `Door reader (${door.side.toUpperCase()} side) for ${room.name}.`, door, room };
    }
    case 'ext': { const ext = EXTERNAL_BY_ID[rest]; return ext ? { id, kind, name: `${ext.name} (simulated external service)`, desc: ext.blurb, ext } : null; }
  }
  return null;
}
export { ALL_PROPS, ALL_DOORS };
