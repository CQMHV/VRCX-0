mod evidence;
mod feed;
mod model;
mod reduce;
#[cfg_attr(not(test), allow(dead_code))]
mod view;

#[cfg(test)]
mod tests;

pub(crate) use evidence::{Claim, Evidence, Source, WsPresenceEvent};
pub(crate) use feed::presence_feed;
pub(crate) use model::{OnlineState, Phase};
pub(crate) use reduce::reduce;
