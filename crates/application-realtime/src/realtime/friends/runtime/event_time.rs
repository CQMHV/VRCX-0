use chrono::{DateTime, Utc};

pub(super) struct EventTime {
    pub(super) iso: String,
    pub(super) timestamp_ms: i64,
}

impl EventTime {
    pub(super) fn from_received_at(received_at: &str) -> Self {
        let timestamp_ms = DateTime::parse_from_rfc3339(received_at)
            .map(|value| value.timestamp_millis())
            .unwrap_or_else(|_| Utc::now().timestamp_millis());
        Self {
            iso: received_at.to_string(),
            timestamp_ms,
        }
    }
}
