let currentGuestAadharFront = null;
let currentGuestAadharBack = null;
let currentGuestSignature = null;
let currentDetailGuestId = null;
let currentRoomId = null;
let currentBookingFilter = 'all';
let draftTimers = {};
let isSaving = false;

function saveDraft(key, data) {
    try {
        localStorage.setItem('draft_' + key, JSON.stringify(data));
    } catch (e) { }
}

function loadDraft(key) {
    try {
        const raw = localStorage.getItem('draft_' + key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function clearDraft(key) {
    localStorage.removeItem('draft_' + key);
}

function debounceDraft(key, getFormData, delay = 500) {
    if (draftTimers[key]) clearTimeout(draftTimers[key]);
    draftTimers[key] = setTimeout(() => saveDraft(key, getFormData()), delay);
}

function showToast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        if (toast.parentNode) toast.remove();
    }, 3000);
}

function showConfirmDialog(message) {
    return new Promise(resolve => {
        const overlay = document.getElementById('confirmOverlay');
        document.getElementById('confirmMessage').textContent = message;
        overlay.classList.add('active');

        const onOk = () => {
            cleanup();
            resolve(true);
        };
        const onCancel = () => {
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            overlay.classList.remove('active');
            document.getElementById('confirmOk').removeEventListener('click', onOk);
            document.getElementById('confirmCancel').removeEventListener('click', onCancel);
        };

        document.getElementById('confirmOk').addEventListener('click', onOk);
        document.getElementById('confirmCancel').addEventListener('click', onCancel);
    });
}

function renderBalance(total, advance) {
    const paid = advance || 0;
    const balance = total - paid;
    if (balance <= 0) {
        return '<span class="balance-zero">Paid</span>';
    }
    return '<span class="balance-positive">Rs. ' + balance.toLocaleString('en-IN') + '</span>';
}

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
    await Promise.all([getGuests(), getBookings(), getCheckouts()]);
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
    renderTodayActivity();
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

function renderTodayActivity() {
    const today = getToday();
    const checkins = cachedBookings.filter(b => b.checkIn === today);
    const checkouts = cachedCheckouts.filter(c => c.date === today);

    const checkinContainer = document.getElementById('todayCheckins');
    if (checkins.length === 0) {
        checkinContainer.innerHTML = '<div class="activity-empty">No check-ins today</div>';
    } else {
        checkinContainer.innerHTML = checkins.map(b => {
            const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
            const names = guestIds.map(gid => {
                const g = cachedGuests.find(guest => guest.id === gid);
                return g ? g.name : 'Unknown';
            });
            return `
                <div class="activity-item">
                    <span class="activity-name">${names.map(n => escapeHtml(n)).join(', ')}</span>
                    <span class="activity-room">${escapeHtml(b.reference || '-')}</span>
                </div>
            `;
        }).join('');
    }

    const checkoutContainer = document.getElementById('todayCheckouts');
    if (checkouts.length === 0) {
        checkoutContainer.innerHTML = '<div class="activity-empty">No check-outs today</div>';
    } else {
        checkoutContainer.innerHTML = checkouts.map(c => `
            <div class="activity-item">
                <span class="activity-name">Room ${escapeHtml(c.roomNumber)}</span>
                <span class="activity-room">Checked Out</span>
            </div>
        `).join('');
    }
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
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);padding:20px;">No bookings yet</td></tr>';
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
                <td><strong>${escapeHtml(b.reference || '-')}</strong></td>
                <td>${names.map(n => escapeHtml(n)).join(', ')}</td>
                <td>${room ? room.number : '-'}</td>
                <td>${formatDisplayDate(b.checkIn)}${b.checkInTime ? ', ' + formatTime12(b.checkInTime) : ''}</td>
                <td>${formatDisplayDate(b.checkOut)}${b.checkOutTime ? ', ' + formatTime12(b.checkOutTime) : ''}</td>
                <td>-</td>
            </tr>
        `;
    }).join('');
}

function renderGuests() {
    const guests = cachedGuests;
    const search = document.getElementById('guestSearch').value.toLowerCase();
    const filtered = guests.filter(g =>
        g.name.toLowerCase().includes(search) ||
        g.phone.includes(search) ||
        (g.serialNo && g.serialNo.toLowerCase().includes(search))
    );

    const tbody = document.getElementById('guestsBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary);padding:20px;">No guests found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(g => `
        <tr>
            <td><span class="clickable-name" onclick="openGuestDetailModal('${g.id}')">${escapeHtml(g.name)}</span></td>
            <td>${escapeHtml(g.phone)}</td>
            <td>${escapeHtml(g.serialNo || '-')}</td>
            <td>
                <button class="btn-icon" onclick="openGuestModal('${g.id}')" title="Edit">&#9998;</button>
                <button class="btn-icon" onclick="deleteGuest('${g.id}')" title="Delete">&#128465;</button>
            </td>
        </tr>
    `).join('');
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
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:20px;">No bookings found</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(b => {
        const guestIds = b.guestIds || (b.guestId ? [b.guestId] : []);
        const names = guestIds.map(gid => {
            const g = guests.find(guest => guest.id === gid);
            return g ? g.name : 'Unknown';
        });
        const room = rooms.find(r => r.id === b.roomId);
        const status = b.status || 'Confirmed';
        const isCheckedOut = status === 'Checked-Out';
        const statusOptions = ['Confirmed', 'Checked-In', 'Checked-Out'];
        const statusSelect = isCheckedOut
            ? '<span class="status-badge checked-out">Checked-Out</span>'
            : `<select class="booking-status-select" onchange="changeBookingStatus('${b.id}', this.value)">
                ${statusOptions.map(s => `<option value="${s}" ${s === status ? 'selected' : ''}>${s}</option>`).join('')}
               </select>`;
        return `
            <tr>
                <td><strong>${escapeHtml(b.reference || '-')}</strong></td>
                <td><div class="guest-tags">${names.map(n => `<span class="guest-tag">${escapeHtml(n)}</span>`).join('')}</div></td>
                <td>${room ? room.number : '-'}</td>
                <td>${formatDisplayDate(b.checkIn)}${b.checkInTime ? ', ' + formatTime12(b.checkInTime) : ''}</td>
                <td>${formatDisplayDate(b.checkOut)}${b.checkOutTime ? ', ' + formatTime12(b.checkOutTime) : ''}</td>
                <td>${b.totalPrice > 0 ? 'Rs. ' + b.totalPrice.toLocaleString('en-IN') : '-'}</td>
                <td>${b.totalPrice > 0 ? renderBalance(b.totalPrice, b.advancePaid) : '-'}</td>
                <td>${statusSelect}</td>
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

async function changeBookingStatus(bookingId, newStatus) {
    await updateBookingStatus(bookingId, newStatus);
    if (newStatus === 'Checked-Out') {
        const booking = getBookingById(bookingId);
        if (booking) {
            const today = getToday();
            const room = getRoomById(booking.roomId);
            const checkout = {
                id: generateId(),
                roomId: booking.roomId,
                roomNumber: room ? room.number : '',
                bookingId: bookingId,
                date: today,
                createdAt: new Date().toISOString()
            };
            await saveCheckoutData(checkout);
            await updateRoomStatus(booking.roomId, 'available');
        }
    } else if (newStatus === 'Checked-In') {
        const booking = getBookingById(bookingId);
        if (booking) {
            await updateRoomStatus(booking.roomId, 'occupied');
        }
    }
    await updateRoomStatusesFromBookings();
    showToast('Booking status updated');
    renderRoomGrid();
    renderBookings();
    renderDashboard();
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
        clearDraft('guest');
    }

    modal.classList.add('active');

    const guestDraftFields = ['guestName', 'guestPhone', 'guestEmail', 'guestSerialNo', 'guestNotes'];
    guestDraftFields.forEach(f => {
        document.getElementById(f).addEventListener('input', () => {
            debounceDraft('guest', () => {
                const d = {};
                guestDraftFields.forEach(k => d[k] = document.getElementById(k).value);
                return d;
            });
        });
    });
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
    if (isSaving) return;
    isSaving = true;

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

    const isEdit = document.getElementById('guestId').value;
    await saveGuestData(guest);
    clearDraft('guest');
    showToast(isEdit ? 'Guest updated' : 'Guest added');
    isSaving = false;
    closeGuestModal();
    renderGuests();
    renderDashboard();
}

async function deleteGuest(id) {
    if (isSaving) return;
    if (await showConfirmDialog('Are you sure you want to delete this guest?')) {
        isSaving = true;
        await deleteGuestData(id);
        showToast('Guest deleted');
        isSaving = false;
        renderGuests();
        renderDashboard();
    }
}

async function saveBooking(event) {
    event.preventDefault();
    if (isSaving) return;
    isSaving = true;

    const id = document.getElementById('bookingId').value || generateId();
    const roomId = document.getElementById('bookingRoom').value;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;
    const guestIds = getSelectedGuestIds();

    const booking = {
        id: id,
        reference: getBookingById(id)?.reference || 'HTL-' + String(cachedBookings.length + 1).padStart(3, '0'),
        guestIds: guestIds,
        roomId: roomId,
        checkIn: checkIn,
        checkOut: checkOut,
        checkInTime: document.getElementById('bookingCheckInTime').value || '14:00',
        checkOutTime: document.getElementById('bookingCheckOutTime').value || '11:00',
        pricePerNight: parseFloat(document.getElementById('bookingPrice').value) || 0,
        totalPrice: parseFloat(document.getElementById('bookingTotal').value) || 0,
        advancePaid: parseFloat(document.getElementById('bookingAdvance').value) || 0,
        createdAt: getBookingById(id)?.createdAt || new Date().toISOString()
    };

    const isEdit = document.getElementById('bookingId').value;
    await saveBookingData(booking);
    await updateRoomStatusesFromBookings();
    clearDraft('booking');
    showToast(isEdit ? 'Booking updated' : 'Booking added');
    isSaving = false;
    closeBookingModal();
    renderRoomGrid();
    renderBookings();
    renderDashboard();
}

async function deleteBooking(id) {
    if (isSaving) return;
    if (await showConfirmDialog('Are you sure you want to delete this booking?')) {
        isSaving = true;
        await deleteBookingData(id);
        await updateRoomStatusesFromBookings();
        showToast('Booking deleted');
        isSaving = false;
        renderRoomGrid();
        renderBookings();
        renderDashboard();
    }
}

async function saveRoomStatus() {
    if (!currentRoomId || isSaving) return;
    isSaving = true;
    const room = getRoomById(currentRoomId);
    const oldStatus = room ? room.status : '';
    const newStatus = document.getElementById('roomStatusSelect').value;

    if (oldStatus === 'occupied' && newStatus !== 'occupied') {
        const roomNum = room ? room.number : '';
        const activeBooking = cachedBookings.find(b =>
            b.roomId === currentRoomId &&
            getToday() >= b.checkIn &&
            getToday() <= b.checkOut
        );
        const checkout = {
            id: generateId(),
            roomId: currentRoomId,
            roomNumber: roomNum,
            bookingId: activeBooking ? activeBooking.id : null,
            date: getToday(),
            createdAt: new Date().toISOString()
        };
        await saveCheckoutData(checkout);

        if (activeBooking) {
            await updateBookingStatus(activeBooking.id, 'Checked-Out');
        }
    }

    await updateRoomStatus(currentRoomId, newStatus);
    showToast('Room status updated');
    closeRoomModal();
    isSaving = false;
    renderRoomGrid();
    renderTodayActivity();
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
    document.getElementById('bookingAdvance').value = '';
    document.getElementById('bookingGuestSearch').value = '';
    document.getElementById('bookingGuestFilter').value = 'never-booked';
    document.getElementById('autoTotal').checked = true;
    document.getElementById('bookingTotal').readOnly = true;
    document.getElementById('bookingTotal').style.background = 'var(--bg-primary)';
    currentRoomFilter = 'all';
    document.querySelectorAll('#roomFilterChips .chip').forEach(c => c.classList.remove('active'));
    document.querySelector('#roomFilterChips .chip').classList.add('active');

    populateGuestCheckboxes([]);
    populateRoomDropdown();

    if (id) {
        const booking = getBookingById(id);
        if (booking) {
            title.textContent = 'Edit Booking';
            document.getElementById('bookingId').value = booking.id;
            const guestIds = booking.guestIds || (booking.guestId ? [booking.guestId] : []);
            document.getElementById('bookingGuestFilter').value = 'all';
            populateGuestCheckboxes(guestIds);
            document.getElementById('bookingRoom').value = booking.roomId;
            document.getElementById('bookingCheckIn').value = booking.checkIn;
            document.getElementById('bookingCheckOut').value = booking.checkOut;
            document.getElementById('bookingCheckInTime').value = booking.checkInTime || '14:00';
            document.getElementById('bookingCheckOutTime').value = booking.checkOutTime || '11:00';
            document.getElementById('bookingPrice').value = booking.pricePerNight || '';
            document.getElementById('bookingTotal').value = booking.totalPrice || '';
            document.getElementById('bookingAdvance').value = booking.advancePaid || '';
        }
    } else {
        title.textContent = 'Add Booking';
        const draft = loadDraft('booking');
        if (draft) {
            document.getElementById('bookingRoom').value = draft.roomId || '';
            document.getElementById('bookingCheckIn').value = draft.checkIn || '';
            document.getElementById('bookingCheckOut').value = draft.checkOut || '';
            document.getElementById('bookingCheckInTime').value = draft.checkInTime || '14:00';
            document.getElementById('bookingCheckOutTime').value = draft.checkOutTime || '11:00';
            document.getElementById('bookingPrice').value = draft.pricePerNight || '';
            document.getElementById('bookingTotal').value = draft.totalPrice || '';
            document.getElementById('bookingAdvance').value = draft.advancePaid || '';
            if (draft.guestIds) populateGuestCheckboxes(draft.guestIds);
        }
    }

    modal.classList.add('active');

    const bookingDraftFields = ['bookingRoom', 'bookingCheckIn', 'bookingCheckOut', 'bookingCheckInTime', 'bookingCheckOutTime', 'bookingPrice', 'bookingTotal', 'bookingAdvance'];
    bookingDraftFields.forEach(f => {
        document.getElementById(f).addEventListener('input', () => {
            debounceDraft('booking', () => {
                const d = {};
                bookingDraftFields.forEach(k => d[k] = document.getElementById(k).value);
                d.guestIds = getSelectedGuestIds();
                return d;
            });
        });
    });
}

function closeBookingModal() {
    document.getElementById('bookingModal').classList.remove('active');
}

function populateGuestCheckboxes(selectedIds) {
    const container = document.getElementById('bookingGuestCheckboxes');
    const searchInput = document.getElementById('bookingGuestSearch');
    const filterSelect = document.getElementById('bookingGuestFilter');
    const search = searchInput ? searchInput.value.toLowerCase() : '';
    const filter = filterSelect ? filterSelect.value : 'never-booked';

    const guestIdsWithBookings = new Set();
    cachedBookings.forEach(b => {
        const ids = b.guestIds || (b.guestId ? [b.guestId] : []);
        ids.forEach(id => guestIdsWithBookings.add(id));
    });

    const filtered = cachedGuests.filter(g => {
        const matchesSearch = g.name.toLowerCase().includes(search) || g.phone.includes(search);
        if (!matchesSearch) return false;
        if (filter === 'never-booked') return !guestIdsWithBookings.has(g.id);
        return true;
    });

    container.innerHTML = filtered.map(g => `
        <label class="guest-checkbox">
            <input type="checkbox" value="${g.id}" ${selectedIds.includes(g.id) ? 'checked' : ''}>
            <span>${escapeHtml(g.name)}</span>
        </label>
    `).join('');

    if (filtered.length === 0) {
        container.innerHTML = '<div style="padding:12px;text-align:center;color:var(--text-secondary);font-size:13px;">No guests found</div>';
    }
}

function getSelectedGuestIds() {
    return Array.from(document.querySelectorAll('#bookingGuestCheckboxes input:checked')).map(cb => cb.value);
}

let currentRoomFilter = 'all';

function filterRooms(type, btn) {
    currentRoomFilter = type;
    document.querySelectorAll('#roomFilterChips .chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    populateRoomDropdown();
}

function populateRoomDropdown() {
    const select = document.getElementById('bookingRoom');
    const rooms = cachedRooms.filter(r => r.status === 'available');
    const filter = currentRoomFilter;

    const filtered = rooms.filter(r => {
        if (filter === 'all') return true;
        if (filter === 'AC') return r.type === 'AC';
        if (filter === 'Non-AC') return r.type === 'Non-AC';
        if (filter === 'Single') return r.bedType === 'Single';
        if (filter === 'Double') return r.bedType === 'Double';
        return true;
    });

    select.innerHTML = '<option value="">Select Room</option>' +
        filtered.map(r => {
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
    const autoCheck = document.getElementById('autoTotal');
    if (!autoCheck || !autoCheck.checked) return;

    const pricePerNight = parseFloat(document.getElementById('bookingPrice').value) || 0;
    const checkIn = document.getElementById('bookingCheckIn').value;
    const checkOut = document.getElementById('bookingCheckOut').value;

    if (pricePerNight > 0 && checkIn && checkOut) {
        const nights = calculateNights(checkIn, checkOut);
        if (nights > 0) {
            document.getElementById('bookingTotal').value = pricePerNight * nights;
        }
    }
}

function toggleAutoTotal() {
    const auto = document.getElementById('autoTotal').checked;
    const totalInput = document.getElementById('bookingTotal');
    if (auto) {
        totalInput.readOnly = true;
        totalInput.style.background = 'var(--bg-primary)';
        calculateTotal();
    } else {
        totalInput.readOnly = false;
        totalInput.style.background = '';
    }
}

function onTotalManualEdit() {
    const autoCheck = document.getElementById('autoTotal');
    if (autoCheck.checked) {
        autoCheck.checked = false;
        toggleAutoTotal();
    }
}

function openRoomModal(roomId) {
    const room = getRoomById(roomId);
    if (!room) return;

    currentRoomId = roomId;
    document.getElementById('roomModalNumber').textContent = room.number;
    document.getElementById('roomModalInfo').innerHTML = `
        <p><strong>Type:</strong> ${room.type} | <strong>Bed:</strong> ${room.bedType} | <strong>Price:</strong> ${formatCurrency(room.pricePerNight)}</p>
    `;

    if (room.status === 'occupied') {
        document.getElementById('roomModalOccupied').style.display = 'block';
        document.getElementById('roomModalFree').style.display = 'none';

        const today = getToday();
        const booking = cachedBookings.find(b =>
            b.roomId === roomId &&
            today >= b.checkIn &&
            today <= b.checkOut
        );

        if (booking) {
            const guestIds = booking.guestIds || (booking.guestId ? [booking.guestId] : []);
            const guests = guestIds.map(gid => cachedGuests.find(g => g.id === gid)).filter(Boolean);
            document.getElementById('roomBookingInfo').innerHTML = `
                <div class="room-booking-detail">
                    <div class="room-booking-row">
                        <span class="room-booking-label">Guest(s)</span>
                        <div class="room-booking-guests">
                            ${guests.map(g => `<span class="clickable-name" onclick="closeRoomModal();openGuestDetailModal('${g.id}')">${escapeHtml(g.name)}</span>`).join(', ')}
                        </div>
                    </div>
                    <div class="room-booking-row">
                        <span class="room-booking-label">Check-in</span>
                        <span>${formatDisplayDate(booking.checkIn)}${booking.checkInTime ? ', ' + formatTime12(booking.checkInTime) : ''}</span>
                    </div>
                    <div class="room-booking-row">
                        <span class="room-booking-label">Check-out</span>
                        <span>${formatDisplayDate(booking.checkOut)}${booking.checkOutTime ? ', ' + formatTime12(booking.checkOutTime) : ''}</span>
                    </div>
                    <div class="room-booking-row">
                        <span class="room-booking-label">Reference</span>
                        <span><strong>${escapeHtml(booking.reference || '-')}</strong></span>
                    </div>
                </div>
            `;
        } else {
            document.getElementById('roomBookingInfo').innerHTML = '<div class="activity-empty">No active booking found</div>';
        }
    } else {
        document.getElementById('roomModalOccupied').style.display = 'none';
        document.getElementById('roomModalFree').style.display = 'block';
        document.getElementById('roomStatusSelect').value = room.status;
    }

    document.getElementById('roomModal').classList.add('active');
}

function closeRoomModal() {
    document.getElementById('roomModal').classList.remove('active');
    currentRoomId = null;
}

async function checkoutRoom() {
    if (!currentRoomId || isSaving) return;
    isSaving = true;
    const room = getRoomById(currentRoomId);
    const roomNum = room ? room.number : '';
    const today = getToday();

    const activeBooking = cachedBookings.find(b =>
        b.roomId === currentRoomId &&
        today >= b.checkIn &&
        today <= b.checkOut
    );

    try {
        const checkout = {
            id: generateId(),
            roomId: currentRoomId,
            roomNumber: roomNum,
            bookingId: activeBooking ? activeBooking.id : null,
            date: today,
            createdAt: new Date().toISOString()
        };
        await saveCheckoutData(checkout);

        if (activeBooking) {
            await updateBookingStatus(activeBooking.id, 'Checked-Out');
        }
    } catch (err) {
        console.error('Checkout save error:', err);
    }

    await updateRoomStatus(currentRoomId, 'available');
    showToast('Room checked out');
    closeRoomModal();
    isSaving = false;
    renderRoomGrid();
    renderTodayActivity();
    renderBookings();
    renderDashboard();
}
