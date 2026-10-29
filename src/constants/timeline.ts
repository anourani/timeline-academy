// Layout dimensions
export const HEADER_HEIGHT = 64;            // Height of year labels (32px) + month labels (32px)

// Event row dimensions
export const EVENT_ROW_HEIGHT = 38;       // 36px event row + vertical padding
export const EVENT_MIN_WIDTH = 120;       // Minimum width for event title visibility

// Lane dimensions
export const CATEGORY_PADDING = 8;        // Vertical padding below a lane's last row of events
export const LANE_MIN_HEIGHT = 80;        // Minimum height of the World Events lane, so its label pill always fits

// Scroll behaviour
export const SCROLL_LEAD_IN_MONTHS = 2;   // Months of the previous chapter left visible when jumping to a chapter's head
export const WHEEL_SUPPRESS_MS = 150;     // Wheel events swallowed after a programmatic jump, so trackpad inertia can't abort it
