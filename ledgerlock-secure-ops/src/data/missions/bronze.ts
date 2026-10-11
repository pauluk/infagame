import type { MeetingAttendee } from '../../game/types';
import { propTarget } from '../targets';

/** The BCP Command Centre (Bronze): its furniture and the fictional service managers who sit at the table. */
export const BT = propTarget('bcp_command', 'bronze_table');
export const COMMS_BOARD = propTarget('bcp_command', 'comms_board');
export const WALL = propTarget('bcp_command', 'situation_wall');
export const SEAT = {
  payments: propTarget('bcp_command', 'seat_payments'), data: propTarget('bcp_command', 'seat_data'),
  collections: propTarget('bcp_command', 'seat_collections'), security: propTarget('bcp_command', 'seat_security'),
};

export const ROSTER = {
  payments: { name: 'Amara Okoye', role: 'Payments Service Manager', service: 'Payments' },
  data: { name: 'Tomás Reyes', role: 'Data & Analytics Service Manager', service: 'Events and reporting' },
  collections: { name: 'Priyanka Shah', role: 'Collections Service Manager', service: 'Receivables and the agency link' },
  security: { name: 'Elena Novak', role: 'Information Security Lead', service: 'Security' },
} as const;
export type Who = keyof typeof ROSTER;

/** One service manager's report at the table. */
export const says = (who: Who, status: MeetingAttendee['status'], text: string): MeetingAttendee => ({ ...ROSTER[who], status, says: text });
