//! Where the plate sits: which edge of which screen, and how far along that edge.
//!
//! The maths is kept in plain functions (no windows involved) so it can be unit-tested.

use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Edge {
    Left,
    Right,
    Top,
    Bottom,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PlatePos {
    pub edge: Edge,
    /// 0.0 = start of the edge (top, or left), 1.0 = end (bottom, or right).
    pub offset: f64,
    /// Name of the screen it was dropped on; falls back to the main screen if that one is gone.
    pub monitor: Option<String>,
}

impl PlatePos {
    pub const DEFAULT: PlatePos = PlatePos { edge: Edge::Left, offset: 0.5, monitor: None };
}

/// A screen's usable area (menu bar and Dock excluded), in physical pixels.
#[derive(Clone, Copy, Debug)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

/// How close to an end of an edge (as a fraction of its length) counts as "in the corner".
pub const CORNER_SNAP: f64 = 0.08;

/// Top-left position for a `win_w` x `win_h` window placed on `edge` at `offset`, flush with the
/// edge and kept fully inside `area`. Offsets 0 and 1 put it right in a corner.
pub fn place(area: Area, win_w: i32, win_h: i32, edge: Edge, offset: f64) -> (i32, i32) {
    let offset = offset.clamp(0.0, 1.0);
    let along = |start: i32, len: i32, size: i32| -> i32 {
        let centre = start as f64 + offset * len as f64;
        let max = start + (len - size).max(0);
        ((centre - size as f64 / 2.0).round() as i32).clamp(start, max)
    };
    match edge {
        Edge::Left => (area.x, along(area.y, area.h, win_h)),
        Edge::Right => (area.x + area.w - win_w, along(area.y, area.h, win_h)),
        Edge::Top => (along(area.x, area.w, win_w), area.y),
        Edge::Bottom => (along(area.x, area.w, win_w), area.y + area.h - win_h),
    }
}

/// The edge nearest to a point (where the plate was let go), and how far along that edge it is.
/// Near the ends of an edge the offset snaps to 0 or 1, so the plate tucks into the corner.
pub fn snap(area: Area, cx: f64, cy: f64) -> (Edge, f64) {
    let (x0, y0) = (area.x as f64, area.y as f64);
    let (w, h) = (area.w.max(1) as f64, area.h.max(1) as f64);
    let candidates = [
        (Edge::Left, cx - x0),
        (Edge::Right, x0 + w - cx),
        (Edge::Top, cy - y0),
        (Edge::Bottom, y0 + h - cy),
    ];
    let edge = candidates
        .iter()
        .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
        .map(|c| c.0)
        .unwrap_or(Edge::Left);
    let raw = match edge {
        Edge::Left | Edge::Right => (cy - y0) / h,
        Edge::Top | Edge::Bottom => (cx - x0) / w,
    }
    .clamp(0.0, 1.0);
    let offset = if raw < CORNER_SNAP {
        0.0
    } else if raw > 1.0 - CORNER_SNAP {
        1.0
    } else {
        raw
    };
    (edge, offset)
}

#[cfg(test)]
mod tests {
    use super::*;

    // A 1440x875 work area that starts below a 25px menu bar.
    const A: Area = Area { x: 0, y: 25, w: 1440, h: 875 };

    #[test]
    fn default_is_left_middle() {
        assert_eq!(place(A, 16, 176, Edge::Left, 0.5), (0, 25 + (875 - 176) / 2 + 1));
    }

    #[test]
    fn each_edge_is_flush_and_inside() {
        let (w, h) = (16, 176);
        assert_eq!(place(A, w, h, Edge::Left, 0.5).0, 0);
        assert_eq!(place(A, w, h, Edge::Right, 0.5).0, 1440 - w);
        let (hw, hh) = (176, 16);
        assert_eq!(place(A, hw, hh, Edge::Top, 0.5).1, 25);
        assert_eq!(place(A, hw, hh, Edge::Bottom, 0.5).1, 25 + 875 - hh);
    }

    #[test]
    fn corners_stay_on_screen() {
        assert_eq!(place(A, 16, 176, Edge::Left, 0.0), (0, 25));
        assert_eq!(place(A, 16, 176, Edge::Right, 1.0), (1440 - 16, 25 + 875 - 176));
        assert_eq!(place(A, 176, 16, Edge::Top, 1.0), (1440 - 176, 25));
        assert_eq!(place(A, 176, 16, Edge::Bottom, 0.0), (0, 25 + 875 - 16));
        // out-of-range offsets are clamped, never off screen
        assert_eq!(place(A, 16, 176, Edge::Left, 7.0), (0, 25 + 875 - 176));
    }

    #[test]
    fn snaps_to_the_nearest_edge() {
        assert_eq!(snap(A, 30.0, 450.0).0, Edge::Left);
        assert_eq!(snap(A, 1420.0, 450.0).0, Edge::Right);
        assert_eq!(snap(A, 700.0, 40.0).0, Edge::Top);
        assert_eq!(snap(A, 700.0, 890.0).0, Edge::Bottom);
    }

    #[test]
    fn keeps_the_spot_along_the_edge() {
        let (e, o) = snap(A, 20.0, 25.0 + 875.0 * 0.3);
        assert_eq!(e, Edge::Left);
        assert!((o - 0.3).abs() < 1e-9);
        let (e, o) = snap(A, 1440.0 * 0.7, 30.0);
        assert_eq!(e, Edge::Top);
        assert!((o - 0.7).abs() < 1e-9);
    }

    #[test]
    fn tucks_into_corners() {
        // dropped near the top-left corner, closer to the left edge
        assert_eq!(snap(A, 10.0, 40.0), (Edge::Left, 0.0));
        // near the bottom-right corner, closer to the bottom edge
        assert_eq!(snap(A, 1400.0, 895.0), (Edge::Bottom, 1.0));
    }

    #[test]
    fn dropped_off_screen_still_lands_on_screen() {
        // far below and a little left of the screen: furthest past the bottom edge, so it goes
        // there, tucked into the bottom-left corner
        let (e, o) = snap(A, -300.0, 2000.0);
        assert_eq!((e, o), (Edge::Bottom, 0.0));
        let (x, y) = place(A, 176, 16, e, o);
        assert!(x >= 0 && y >= 25 && x + 176 <= 1440 && y + 16 <= 25 + 875);
        // and off the right side, it goes to the right edge
        assert_eq!(snap(A, 1600.0, 450.0).0, Edge::Right);
    }
}
