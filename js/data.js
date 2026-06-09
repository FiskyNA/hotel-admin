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

function initRooms() {
    let rooms = localStorage.getItem('hotel_rooms');
    if (!rooms) {
        const initialRooms = ROOMS_DATA.map(r => ({
            id: generateId(),
            number: r.number,
            type: r.type,
            bedType: r.bedType,
            pricePerNight: r.pricePerNight,
            status: 'available'
        }));
        localStorage.setItem('hotel_rooms', JSON.stringify(initialRooms));
        return initialRooms;
    }
    return JSON.parse(rooms);
}

function getRooms() {
    const rooms = localStorage.getItem('hotel_rooms');
    return rooms ? JSON.parse(rooms) : [];
}

function getRoomById(id) {
    return getRooms().find(r => r.id === id);
}

function getRoomByNumber(number) {
    return getRooms().find(r => r.number === number);
}

function updateRoomStatus(roomId, status) {
    const rooms = getRooms();
    const index = rooms.findIndex(r => r.id === roomId);
    if (index !== -1) {
        rooms[index].status = status;
        localStorage.setItem('hotel_rooms', JSON.stringify(rooms));
    }
}

function getGuests() {
    const guests = localStorage.getItem('hotel_guests');
    return guests ? JSON.parse(guests) : [];
}

function getGuestById(id) {
    return getGuests().find(g => g.id === id);
}

function saveGuestData(guest) {
    const guests = getGuests();
    const index = guests.findIndex(g => g.id === guest.id);
    if (index !== -1) {
        guests[index] = guest;
    } else {
        guests.push(guest);
    }
    localStorage.setItem('hotel_guests', JSON.stringify(guests));
}

function deleteGuestData(id) {
    const guests = getGuests().filter(g => g.id !== id);
    localStorage.setItem('hotel_guests', JSON.stringify(guests));
}

function getBookings() {
    const bookings = localStorage.getItem('hotel_bookings');
    return bookings ? JSON.parse(bookings) : [];
}

function getBookingById(id) {
    return getBookings().find(b => b.id === id);
}

function saveBookingData(booking) {
    const bookings = getBookings();
    const index = bookings.findIndex(b => b.id === booking.id);
    if (index !== -1) {
        bookings[index] = booking;
    } else {
        bookings.push(booking);
    }
    localStorage.setItem('hotel_bookings', JSON.stringify(bookings));
}

function deleteBookingData(id) {
    const bookings = getBookings().filter(b => b.id !== id);
    localStorage.setItem('hotel_bookings', JSON.stringify(bookings));
}

function getActiveBookings() {
    const today = getToday();
    return getBookings().filter(b =>
        (b.status === 'Confirmed' || b.status === 'Checked-In') &&
        b.checkOut >= today
    );
}

function isRoomAvailable(roomId, checkIn, checkOut, excludeBookingId) {
    const bookings = getBookings();
    return !bookings.some(b =>
        b.roomId === roomId &&
        b.id !== excludeBookingId &&
        b.status !== 'Cancelled' &&
        b.status !== 'Checked-Out' &&
        checkIn < b.checkOut &&
        checkOut > b.checkIn
    );
}

function updateRoomStatusesFromBookings() {
    const rooms = getRooms();
    const today = getToday();
    const bookings = getBookings();

    rooms.forEach(room => {
        const activeBooking = bookings.find(b =>
            b.roomId === room.id &&
            b.status !== 'Cancelled' &&
            b.status !== 'Checked-Out' &&
            today >= b.checkIn &&
            today <= b.checkOut
        );

        if (activeBooking) {
            room.status = 'occupied';
        } else if (room.status === 'occupied') {
            room.status = 'available';
        }
    });

    localStorage.setItem('hotel_rooms', JSON.stringify(rooms));
}
