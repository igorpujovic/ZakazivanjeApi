# Salon Booking

A single hair salon takes appointments online. Clients choose a service, a stylist and a
time; salon staff manage what is on offer and what has been agreed.

## Language

### People

**Client**:
A person who books services for themselves. Sees only their own bookings.
_Avoid_: Customer, guest, buyer

**Admin**:
A member of salon staff who manages the catalogue and every booking, including other
people's.
_Avoid_: Manager, owner, staff, moderator

**Stylist**:
A person who performs services. A stylist is a name on the schedule, not someone who logs
in — stylists have no account and never use the system themselves.
_Avoid_: Employee, hairdresser, barber, provider, resource

### What the salon sells

**Service**:
Something the salon offers, such as a haircut or a colouring, with a price and a duration.
_Avoid_: Treatment, product, item, offering

**Duration**:
How long a service occupies a stylist, start to finish. It is the only thing that decides
when a booking ends.
_Avoid_: Length, time, slot size

**Active**:
Whether a service or a stylist may be chosen for a *new* booking. Making something
inactive withdraws it from the menu; it stays on every booking already made against it.
_Avoid_: Enabled, visible, deleted, archived

### What the salon maintains

**Catalogue**:
Everything the salon keeps for bookings to be made against: its services and its stylists,
active or not. It is what an admin curates, and it holds what has been withdrawn just as it
holds what is on offer.
_Avoid_: Inventory, listing, directory, master data

**Menu**:
The active services a client may choose from — the catalogue as a client sees it. A service
withdrawn from the menu stays in the catalogue, and on every booking already made against it.
_Avoid_: Price list, offerings, products, options

### Time

**Working Hours**:
The span of a given weekday during which the salon accepts bookings. A weekday with no
working hours is a day the salon is closed.
_Avoid_: Opening times, business hours, availability, schedule

**Slot**:
A start time offered to a client for a chosen day, stylist and service. A slot is only
offered when the whole service fits inside working hours without overlapping anything.
A slot is an offer, not a reservation — nothing is held until a booking is made.
_Avoid_: Timeslot, opening, availability, gap

**Overlap**:
Two bookings for the same stylist sharing any part of their time. Bookings that merely
touch — one ending exactly as the next begins — do not overlap, and both are allowed.
_Avoid_: Clash, conflict, collision, double-booking

**Cancellation Deadline**:
The latest moment a client may cancel their own booking: two hours before it starts.
It binds clients only; admins may cancel at any time.
_Avoid_: Cutoff, grace period, cancellation window

### The booking itself

**Booking**:
An agreement that one stylist will perform one service for one client, starting at a
stated time on a stated day. A booking records what was agreed when it was made, so later
edits to a service never change bookings already taken.
_Avoid_: Appointment, reservation, slot, order, session

**Scheduled**:
A booking that has been agreed and not yet resolved. The only status from which a booking
can still change.
_Avoid_: Pending, confirmed, open, active, booked

**Completed**:
A booking whose service was carried out. Final.
_Avoid_: Done, finished, fulfilled, closed

**Cancelled**:
A booking that will not happen, called off by the client or by the salon. Final, and it
releases the stylist's time.
_Avoid_: Deleted, voided, refused, declined

**No-show**:
A client who does not arrive for a scheduled booking. The salon does not record this
distinctly — an admin cancels the booking after the fact, so a no-show and a phoned-in
cancellation look the same afterwards.
_Avoid_: Missed, absent, skipped
