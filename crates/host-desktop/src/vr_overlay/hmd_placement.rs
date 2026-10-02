pub(super) fn hmd_notification_offset(device_hint: &str) -> (f32, f32) {
    match device_hint {
        "hmd:top-left" => (-0.52, 0.38),
        "hmd:top" => (0.0, 0.38),
        "hmd:top-right" => (0.52, 0.38),
        "hmd:left" => (-0.52, -0.12),
        "hmd:center" => (0.0, -0.12),
        "hmd:right" => (0.52, -0.12),
        "hmd:bottom-left" => (-0.52, -0.38),
        "hmd:bottom-right" => (0.52, -0.38),
        _ => (0.0, -0.38),
    }
}
