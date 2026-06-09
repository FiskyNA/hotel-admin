let currentGuestAadharFront = null;
let currentGuestAadharBack = null;
let currentGuestSignature = null;
let currentDetailGuestId = null;
let currentRoomId = null;
let currentBookingFilter = 'all';

document.addEventListener('DOMContentLoaded', async function() {
    setupNavigation();
    setupSidebarToggle();
    try {
        await initRooms();
        await loadAllData();
        await updateRoomStatusesFromBookings();
        renderDashboard();
    } catch (err) {
        console.error('Init error:', err);
    }
});

async function loadAllData() {
    await Promise.all([getGuests(), getBookings()]);
}

function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', function() {
            const page = this.dataset.page;
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
            document.getElementById('page-' + page).classList.add('active');
            closeSidebar();
            if (page === 'dashboard') renderDashboard();
            if (page === 'guests') renderGuests();
            if (page === 'bookings') renderBookings();
        });
    });
}

function setupSidebarToggle() {
    document.getElementById('sidebarToggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('sidebarOverlay').classList.toggle('active');
    });
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

async function renderDashboard() {
    const guests = cachedGuests;
    const bookings = cachedBookings;
    const rooms = cachedRooms;
    const today = getToday();
    const activeBookings = bookings.filter(b =>
        (b.status === 'Confirmed' || b.status === 'Checked-In') && b.checkOut >= today
    );

    document.getElementById('statTotalGuests').textContent = guests.length;
    document.getElementById('statActiveBookings').textContent = activeBookings.length;
    document.getElementById('statAvailableRooms').textContent = rooms.filter(r => r.status === 'available').length;
    document.getElementById('statOccupiedRooms').textContent = rooms.filter(r => r.status === 'occupied').length;

    renderRoomGrid();
    renderRecentBookings();
}

function renderRoomGrid() {
    const rooms = [...cachedRooms].sort((a, b) => {
        const numA = parseInt(a.number);
        const numB = parseInt(b.number);
        if (numA !== numB) return numA - numB;
        return a.number.localeCompare(b.number);
    });
    const grid = document.getElementById('roomGrid');
    grid.innerHTML = rooms.map(room => `
        <div class="room-cell ${room.status}" onclick="openRoomModal('${room.id}')">
            <span class="room-number">${room.number}</span>
            <span class="room-status">${room.status}</span>
        </div>
    `).join('');
}

function renderRecentBookings() {
    const bookings = cachedBookings;
    const guests = cachedGuests;
    const rooms = cachedRooms;

    const recent = bookings
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 5);

    const tbody = document.getElementById('recentBookingsBody');
    if (recent.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px;">No bookings yet</td></tr>';
        return;
    }

    tbody.innerHTML = recent.map(b => {
        const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
        const names = guestIds.map(gid => {
            const g = guests.find(guest => guest.id === gid);
            return g ? g.name : 'Unknown';
        });
        const room = rooms.find(r => r.id === b.roomId);
        return `
            <tr>
                <td>${names.map(n => escapeHtml(n)).join(', ')}</td>
                <td>${room ? room.number : '-'}</td>
                <td>${formatDisplayDate(b.checkIn)}</td>
                <td>${formatDisplayDate(b.checkOut)}</td>
                <td>-</td>
            </tr>
        `;
    }).join('');
}

function renderGuests() {
    const guests = cachedGuests;
    const bookings = cachedBookings;
    const search = document.getElementById('guestSearch').value.toLowerCase();
    const filter = document.getElementById('guestFilter').value;

    const guestBookingCount = {};
    bookings.forEach(b => {
        const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
        guestIds.forEach(gid => {
            guestBookingCount[gid] = (guestBookingCount[gid] || 0) + 1;
        });
    });

    let filtered = guests.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(search) ||
            g.phone.includes(search) ||
            (g.serialNo && g.serialNo.toLowerCase().includes(search));
        if (!matchesSearch) return false;
        if (filter === 'never-booked') return !guestBookingCount[g.id];
        return true;
    });

    const tbody = document.getElementById('guestsBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-secondary);padding:20px;">No guests found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(g => {
        const count = guestBookingCount[g.id] || 0;
        return `
            <tr>
                <td><span class="clickable-name" onclick="openGuestDetailModal('${g.id}')">${escapeHtml(g.name)}</span></td>
                <td>${escapeHtml(g.phone)}</td>
                <td>${escapeHtml(g.serialNo || '-')}</td>
                <td>${count > 0 ? count : '-'}</td>
                <td>
                    <button class="btn-icon" onclick="openGuestModal('${g.id}')" title="Edit">&#9998;</button>
                    <button class="btn-icon" onclick="deleteGuest('${g.id}')" title="Delete">&#128465;</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterGuests() {
    renderGuests();
}

function setBookingFilter(filter, btn) {
    currentBookingFilter = filter;
    document.querySelectorAll('.booking-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderBookings();
}

function renderBookings() {
    const bookings = cachedBookings;
    const guests = cachedGuests;
    const rooms = cachedRooms;
    const search = document.getElementById('bookingSearch').value.toLowerCase();
    const today = getToday();

    let filtered = bookings.filter(b => {
        const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
        const hasGuest = guestIds.some(gid => {
            const g = guests.find(guest => guest.id === gid);
            return g && g.name.toLowerCase().includes(search);
        });
        const room = rooms.find(r => r.id === b.roomId);
        const hasRoom = room && room.number.includes(search);
        return !search || hasGuest || hasRoom;
    });

    if (currentBookingFilter === 'upcoming') {
        filtered = filtered.filter(b => b.checkIn > today);
    } else if (currentBookingFilter === 'checked-in') {
        filtered = filtered.filter(b => today >= b.checkIn && today <= b.checkOut);
    } else if (currentBookingFilter === 'checked-out') {
        filtered = filtered.filter(b => b.checkOut < today);
    }

    filtered.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

    const tbody = document.getElementById('bookingsBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px;">No bookings found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
        const names = guestIds.map(gid => {
            const g = guests.find(guest => guest.id === gid);
            return g ? g.name : 'Unknown';
        });
        const room = rooms.find(r => r.id === b.roomId);
        return `
            <tr>
                <td><div class="guest-tags">${names.map(n => `<span class="guest-tag">${escapeHtml(n)}</span>`).join('')}</div></td>
                <td>${room ? room.number : '-'}</td>
                <td>${formatDisplayDate(b.checkIn)}</td>
                <td>${formatDisplayDate(b.checkOut)}</td>
                <td>${b.totalPrice > 0 ? 'Rs. ' + b.totalPrice.toLocaleString('en-IN') : '-'}</td>
                <td>
                    <button class="btn-icon" onclick="openBookingModal('${b.id}')" title="Edit">&#9998;</button>
                    <button class="btn-icon" onclick="deleteBooking('${b.id}')" title="Delete">&#128465;</button>
                </td>
            </tr>
        `;
    }).join('');
}

function filterBookings() {
    renderBookings();
}

function openGuestModal(id) {
    const modal = document.getElementById('guestModal');
    const title = document.getElementById('guestModalTitle');
    const form = document.getElementById('guestForm');

    form.reset();
    document.getElementById('guestId').value = '';
    document.getElementById('frontPreview').style.display = 'none';
    document.getElementById('backPreview').style.display = 'none';
    document.getElementById('signaturePreview').style.display = 'none';
    document.getElementById('frontPlaceholder').style.display = 'flex';
    document.getElementById('backPlaceholder').style.display = 'flex';
    document.getElementById('signaturePlaceholder').style.display = 'flex';
    currentGuestAadharFront = null;
    currentGuestAadharBack = null;
    currentGuestSignature = null;

    if (id) {
        const guest = getGuestById(id);
        if (guest) {
            title.textContent = 'Edit Guest';
            document.getElementById('guestId').value = guest.id;
            document.getElementById('guestName').value = guest.name;
            document.getElementById('guestPhone').value = guest.phone;
            document.getElementById('guestEmail').value = guest.email || '';
            document.getElementById('guestSerialNo').value = guest.serialNo || '';
            document.getElementById('guestNotes').value = guest.notes || '';
            if (guest.aadharFront) {
                currentGuestAadharFront = guest.aadharFront;
                document.getElementById('frontPreview').src = guest.aadharFront;
                document.getElementById('frontPreview').style.display = 'block';
                document.getElementById('frontPlaceholder').style.display = 'none';
            }
            if (guest.aadharBack) {
                currentGuestAadharBack = guest.aadharBack;
                document.getElementById('backPreview').src = guest.aadharBack;
                document.getElementById('backPreview').style.display = 'block';
                document.getElementById('backPlaceholder').style.display = 'none';
            }
            if (guest.signature) {
                currentGuestSignature = guest.signature;
                document.getElementById('signaturePreview').src = guest.signature;
                document.getElementById('signaturePreview').style.display = 'block';
                document.getElementById('signaturePlaceholder').style.display = 'none';
            }
        }
    } else {
        title.textContent = 'Add Guest';
    }

    modal.classList.add('active');
}

function closeGuestModal() {
    document.getElementById('guestModal').classList.remove('active');
}

function handleAadharUpload(event, side) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const base64 = e.target.result;
        if (side === 'front') {
            currentGuestAadharFront = base64;
            document.getElementById('frontPreview').src = base64;
            document.getElementById('frontPreview').style.display = 'block';
            document.getElementById('frontPlaceholder').style.display = 'none';
        } else {
            currentGuestAadharBack = base64;
            document.getElementById('backPreview').src = base64;
            document.getElementById('backPreview').style.display = 'block';
            document.getElementById('backPlaceholder').style.display = 'none';
        }
    };
    reader.readAsDataURL(file);
}

function handleSignatureUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        currentGuestSignature = e.target.result;
        document.getElementById('signaturePreview').src = currentGuestSignature;
        document.getElementById('signaturePreview').style.display = 'block';
        document.getElementById('signaturePlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function saveGuest(event) {
    event.preventDefault();

    const id = document.getElementById('guestId').value || generateId();
    const guest = {
        id: id,
        name: document.getElementById('guestName').value.trim(),
        phone: document.getElementById('guestPhone').value.trim(),
        email: document.getElementById('guestEmail').value.trim(),
        serialNo: document.getElementById('guestSerialNo').value.trim(),
        aadharFront: currentGuestAadharFront,
        aadharBack: currentGuestAadharBack,
        signature: currentGuestSignature,
        notes: document.getElementById('guestNotes').value.trim(),
        createdAt: getGuestById(id)?.createdAt || new Date().toISOString()
    };

    await saveGuestData(guest);
    closeGuestModal();
    renderGuests();
    renderDashboard();
}

async function deleteGuest(id) {
    if (confirm('Are you sure you want to delete this guest?')) {
        await deleteGuestData(id);
        renderGuests();
        renderDashboard();
    }
}

async function saveBooking(event) {
    event.preventDefault();

    const id = document.getElementById('bookingId').value || generateId();
    const roomId = document.getElementById('bookingRoom').value;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const guestIds = getSelectedGuestIds();

    const booking = {
        id: id,
        guestIds: guestIds,
        roomId: roomId,
        checkIn: checkIn,
        checkOut: checkOut,
        pricePerNight: parseFloat(document.getElementById('bookingPrice').value) || 0,
        totalPrice: parseFloat(document.getElementById('bookingTotal').value) || 0,
        createdAt: getBookingById(id)?.createdAt || new Date().toISOString()
    };

    await saveBookingData(booking);
    closeBookingModal();
    renderBookings();
    renderDashboard();
}

async function deleteBooking(id) {
    if (confirm('Are you sure you want to delete this booking?')) {
        await deleteBookingData(id);
        renderBookings();
        renderDashboard();
    }
}

async function saveRoomStatus() {
    if (!currentRoomId) return;
    const status = document.getElementById('roomStatusSelect').value;
    await updateRoomStatus(currentRoomId, status);
    closeRoomModal();
    renderRoomGrid();
    renderDashboard();
}

function openGuestDetailModal(id) {
    const guest = getGuestById(id);
    if (!guest) return;

    currentDetailGuestId = id;
    const content = document.getElementById('guestDetailContent');
    content.innerHTML = `
        <div class="guest-detail-row">
            <div class="guest-detail-label">Name</div>
            <div class="guest-detail-value">${escapeHtml(guest.name)}</div>
        </div>
        <div class="guest-detail-row">
            <div class="guest-detail-label">Phone</div>
            <div class="guest-detail-value">${escapeHtml(guest.phone)}</div>
        </div>
        <div class="guest-detail-row">
            <div class="guest-detail-label">Email</div>
            <div class="guest-detail-value">${escapeHtml(guest.email || '-')}</div>
        </div>
        <div class="guest-detail-row">
            <div class="guest-detail-label">Serial No</div>
            <div class="guest-detail-value">${escapeHtml(guest.serialNo || '-')}</div>
        </div>
        <div class="guest-detail-row">
            <div class="guest-detail-label">Notes</div>
            <div class="guest-detail-value">${escapeHtml(guest.notes || '-')}</div>
        </div>
        <div class="guest-detail-photos">
            <h3>Aadhaar Card Photos</h3>
            <div class="aadhar-photos">
                <div class="aadhar-photo-box">
                    <div class="photo-label">Front</div>
                    ${guest.aadharFront
                        ? `<img src="${guest.aadharFront}" alt="Aadhaar Front">`
                        : '<div class="no-photo">No photo uploaded</div>'}
                </div>
                <div class="aadhar-photo-box">
                    <div class="photo-label">Back</div>
                    ${guest.aadharBack
                        ? `<img src="${guest.aadharBack}" alt="Aadhaar Back">`
                        : '<div class="no-photo">No photo uploaded</div>'}
                </div>
            </div>
        </div>
        <div class="guest-detail-photos">
            <h3>Signature</h3>
            <div class="aadhar-photos">
                <div class="aadhar-photo-box">
                    <div class="photo-label">Signature</div>
                    ${guest.signature
                        ? `<img src="${guest.signature}" alt="Signature">`
                        : '<div class="no-photo">No signature uploaded</div>'}
                </div>
            </div>
        </div>
    `;

    document.getElementById('editGuestFromDetail').onclick = function() {
        closeGuestDetailModal();
        openGuestModal(id);
    };

    document.getElementById('deleteGuestFromDetail').onclick = async function() {
        closeGuestDetailModal();
        await deleteGuest(id);
    };

    document.getElementById('guestDetailModal').classList.add('active');
}

function closeGuestDetailModal() {
    document.getElementById('guestDetailModal').classList.remove('active');
    currentDetailGuestId = null;
}

async function openBookingModal(id) {
    const modal = document.getElementById('bookingModal');
    const title = document.getElementById('bookingModalTitle');
    const form = document.getElementById('bookingForm');

    form.reset();
    document.getElementById('bookingId').value = '';
    document.getElementById('bookingPrice').value = '';
    document.getElementById('bookingTotal').value = '';

    populateGuestCheckboxes([]);
    populateRoomDropdown();

    if (id) {
        const booking = getBookingById(id);
        if (booking) {
            title.textContent = 'Edit Booking';
            document.getElementById('bookingId').value = booking.id;
            const guestIds = booking.guestIds || (booking.guestId ? [booking.guestId] : []);
            populateGuestCheckboxes(guestIds);
            document.getElementById('bookingRoom').value = booking.roomId;
            document.getElementById('bookingCheckIn').value = booking.checkIn;
            document.getElementById('bookingCheckOut').value = booking.checkOut;
            document.getElementById('bookingPrice').value = booking.pricePerNight || '';
            document.getElementById('bookingTotal').value = booking.totalPrice || '';
        }
    } else {
        title.textContent = 'Add Booking';
    }

    modal.classList.add('active');
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.remove('active');
}

function populateGuestCheckboxes(selectedIds) {
    const container = document.getElementById('bookingGuestCheckboxes');
    container.innerHTML = cachedGuests.map(g => `
        <label class="guest-checkbox">
            <input type="checkbox" value="${g.id}" ${selectedIds.includes(g.id) ? 'checked' : ''}>
            <span>${escapeHtml(g.name)}</span>
        </label>
    `).join('');
}

function getSelectedGuestIds() {
    return Array.from(document.querySelectorAll('#bookingGuestCheckboxes input:checked')).map(cb => cb.value);
}

function populateRoomDropdown() {
    const select = document.getElementById('bookingRoom');
    const rooms = getRooms();

    select.innerHTML = '<option value="">Select Room</option>' +
        rooms.map(r => {
            const label = `${r.number} - ${r.type} ${r.bedType}`;
            return `<option value="${r.id}">${label}</option>`;
        }).join('');
}

function updateBookingPrice() {
    const roomId = document.getElementById('bookingRoom').value;
    const priceInput = document.getElementById('bookingPrice');
    if (roomId) {
        const room = getRoomById(roomId);
        if (room && room.pricePerNight > 0) {
            priceInput.value = room.pricePerNight;
        } else {
            priceInput.value = '';
        }
    } else {
        priceInput.value = '';
    }
}

function calculateTotal() {
    // Total price is manually entered by staff
}

function openRoomModal(roomId) {
    const room = getRoomById(roomId);
    if (!room) return;

    currentRoomId = roomId;
    document.getElementById('roomModalNumber').textContent = room.number;
    document.getElementById('roomModalInfo').innerHTML = `
        <p><strong>Type:</strong> ${room.type} | <strong>Bed:</strong> ${room.bedType} | <strong>Price:</strong> ${formatCurrency(room.pricePerNight)}</p>
    `;
    document.getElementById('roomStatusSelect').value = room.status;
    document.getElementById('roomModal').classList.add('active');
}

function closeRoomModal() {
    document.getElementById('roomModal').classList.remove('active');
    currentRoomId = null;
}

async function saveRoomStatus() {
    if (!currentRoomId) return;
    const status = document.getElementById('roomStatusSelect').value;
    await updateRoomStatus(currentRoomId, status);
    closeRoomModal();
    renderRoomGrid();
    renderDashboard();
}
