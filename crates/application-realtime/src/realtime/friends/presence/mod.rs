mod evidence;
mod feed;
mod model;
mod reduce;
mod view;

#[cfg(test)]
mod tests;

pub(crate) use evidence::{Claim, Evidence, Source, WsPresenceEvent};
pub(crate) use feed::presence_feed;
pub(crate) use model::Phase;
pub(crate) use reduce::reduce;
pub(crate) use view::{dwell_place, presence_view};
