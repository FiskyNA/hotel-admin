const ROOMS_DATA = [
    { number: '101', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '102', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '103', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '104', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '105', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '106', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '107', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '108', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '201', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '202', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '203', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '204', type: 'AC', bedType: 'Double', pricePerNight: 0 },
    { number: '205', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '206', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '301', type: 'Non-AC', bedType: 'Single', pricePerNight: 1000 },
    { number: '302', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 },
    { number: '303', type: 'Non-AC', bedType: 'Double', pricePerNight: 0 }
];

let cachedRooms = [];
let cachedGuests = [];
let cachedBookings = [];

async function initRooms() {
    const snapshot = await db.collection('rooms').get();
    if (snapshot.empty) {
        const batch = db.batch();
        ROOMS_DATA.forEach(r => {
            const ref = db.collection('rooms').doc();
            batch.set(ref, {
                id: ref.id,
                number: r.number,
                type: r.type,
                bedType: r.bedType,
                pricePerNight: r.pricePerNight,
                status: 'available'
            });
        });
        await batch.commit();
        const newSnapshot = await db.collection('rooms').get();
        cachedRooms = newSnapshot.docs.map(doc => doc.data());
    } else {
        cachedRooms = snapshot.docs.map(doc => doc.data());
    }
    return cachedRooms;
}

function getRooms() {
    return cachedRooms;
}

function getRoomById(id) {
    return cachedRooms.find(r => r.id === id);
}

function getRoomByNumber(number) {
    return cachedRooms.find(r => r.number === number);
}

async function updateRoomStatus(roomId, status) {
    await db.collection('rooms').doc(roomId).update({ status });
    const room = cachedRooms.find(r => r.id === roomId);
    if (room) room.status = status;
}

async function getGuests() {
    const snapshot = await db.collection('guests').get();
    cachedGuests = snapshot.docs.map(doc => doc.data());
    return cachedGuests;
}

function getGuestById(id) {
    return cachedGuests.find(g => g.id === id);
}

async function saveGuestData(guest) {
    await db.collection('guests').doc(guest.id).set(guest);
    const index = cachedGuests.findIndex(g => g.id === guest.id);
    if (index !== -1) {
        cachedGuests[index] = guest;
    } else {
        cachedGuests.push(guest);
    }
}

async function deleteGuestData(id) {
    await db.collection('guests').doc(id).delete();
    cachedGuests = cachedGuests.filter(g => g.id !== id);
}

async function getBookings() {
    const snapshot = await db.collection('bookings').get();
    cachedBookings = snapshot.docs.map(doc => doc.data());
    return cachedBookings;
}

function getBookingById(id) {
    return cachedBookings.find(b => b.id === id);
}

async function saveBookingData(booking) {
    await db.collection('bookings').doc(booking.id).set(booking);
    const index = cachedBookings.findIndex(b => b.id === booking.id);
    if (index !== -1) {
        cachedBookings[index] = booking;
    } else {
        cachedBookings.push(booking);
    }
}

async function deleteBookingData(id) {
    await db.collection('bookings').doc(id).delete();
    cachedBookings = cachedBookings.filter(b => b.id !== id);
}

async function getActiveBookings() {
    const today = getToday();
    const bookings = await getBookings();
    return bookings.filter(b =>
        (b.status === 'Confirmed' || b.status === 'Checked-In') &&
        b.checkOut >= today
    );
}

async function isRoomAvailable(roomId, checkIn, checkOut, excludeBookingId) {
    const bookings = await getBookings();
    return !bookings.some(b =>
        b.roomId === roomId &&
        b.id !== excludeBookingId &&
        b.status !== 'Cancelled' &&
        b.status !== 'Checked-Out' &&
        checkIn < b.checkOut &&
        checkOut > b.checkIn
    );
}

async function updateRoomStatusesFromBookings() {
    const today = getToday();
    const bookings = cachedBookings.length > 0 ? cachedBookings : await getBookings();

    const batch = db.batch();
    cachedRooms.forEach(room => {
        const activeBooking = bookings.find(b =>
            b.roomId === room.id &&
            b.status !== 'Cancelled' &&
            b.status !== 'Checked-Out' &&
            today >= b.checkIn &&
            today <= b.checkOut
        );

        let newStatus;
        if (activeBooking) {
            newStatus = 'occupied';
        } else if (room.status === 'occupied') {
            newStatus = 'available';
        } else {
            return;
        }

        if (room.status !== newStatus) {
            room.status = newStatus;
            batch.update(db.collection('rooms').doc(room.id), { status: newStatus });
        }
    });

    await batch.commit();
}
