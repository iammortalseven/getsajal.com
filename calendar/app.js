document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');

    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const eventForm = document.getElementById('eventForm');

    const eventId = document.getElementById('eventId');
    const eventTitle = document.getElementById('eventTitle');
    const eventDate = document.getElementById('eventDate');
    const startTime = document.getElementById('startTime');
    const endTime = document.getElementById('endTime');
    const allDay = document.getElementById('allDay');
    const eventLocation = document.getElementById('eventLocation');
    const eventNotes = document.getElementById('eventNotes');

    const newEventButton = document.getElementById('newEventButton');
    const closeModal = document.getElementById('closeModal');
    const cancelButton = document.getElementById('cancelButton');
    const deleteButton = document.getElementById('deleteButton');

    let savedEvents = JSON.parse(
        localStorage.getItem('myCalendarEvents') || '[]'
    );

    const calendar = new FullCalendar.Calendar(calendarEl, {

        initialView: 'dayGridMonth',

        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },

        selectable: true,
        editable: true,

        events: savedEvents,

        dateClick: function (info) {
            openNewEvent(info.date);
        },

        eventClick: function (info) {
            openEditEvent(info.event);
        },

        eventDrop: function () {
            saveEvents();
        },

        eventResize: function () {
            saveEvents();
        }
    });

    calendar.render();


    // -----------------------------
    // New event
    // -----------------------------

    newEventButton.addEventListener('click', function () {

        openNewEvent(new Date());

    });


    function openNewEvent(date) {

        eventForm.reset();

        eventId.value = '';
        eventTitle.value = '';
        eventLocation.value = '';
        eventNotes.value = '';

        modalTitle.textContent = 'New event';

        deleteButton.classList.add('hidden');

        const dateObject = new Date(date);

        eventDate.value = formatDate(dateObject);

        allDay.checked = true;

        startTime.value = '';
        endTime.value = '';

        modal.classList.remove('hidden');

        eventTitle.focus();
    }


    // -----------------------------
    // Edit event
    // -----------------------------

    function openEditEvent(event) {

        eventForm.reset();

        eventId.value = event.id || '';
        eventTitle.value = event.title || '';

        eventDate.value = formatDate(event.start);

        allDay.checked = event.allDay;

        if (!event.allDay) {

            startTime.value = formatTime(event.start);

            if (event.end) {
                endTime.value = formatTime(event.end);
            }

        }

        eventLocation.value =
            event.extendedProps.location || '';

        eventNotes.value =
            event.extendedProps.notes || '';

        modalTitle.textContent = 'Edit event';

        deleteButton.classList.remove('hidden');

        modal.classList.remove('hidden');

        eventTitle.focus();
    }


    // -----------------------------
    // Save event
    // -----------------------------

    eventForm.addEventListener('submit', function (e) {

        e.preventDefault();

        const title = eventTitle.value.trim();

        if (!title) {
            return;
        }

        const date = eventDate.value;

        let start;
        let end = null;

        if (allDay.checked) {

            start = date;

        } else {

            start = date + 'T' + startTime.value;

            if (endTime.value) {
                end = date + 'T' + endTime.value;
            }
        }


        const existingEvent = eventId.value
            ? calendar.getEventById(eventId.value)
            : null;


        if (existingEvent) {

            existingEvent.setProp('title', title);

            existingEvent.setAllDay(allDay.checked);

            existingEvent.setStart(start);

            if (end) {
                existingEvent.setEnd(end);
            } else {
                existingEvent.setEnd(null);
            }

            existingEvent.setExtendedProp(
                'location',
                eventLocation.value.trim()
            );

            existingEvent.setExtendedProp(
                'notes',
                eventNotes.value.trim()
            );

        } else {

            calendar.addEvent({

                id: Date.now().toString(),

                title: title,

                start: start,

                end: end,

                allDay: allDay.checked,

                extendedProps: {
                    location: eventLocation.value.trim(),
                    notes: eventNotes.value.trim()
                }

            });

        }


        saveEvents();

        closeEventModal();

    });


    // -----------------------------
    // Delete event
    // -----------------------------

    deleteButton.addEventListener('click', function () {

        const id = eventId.value;

        if (!id) {
            return;
        }

        const event = calendar.getEventById(id);

        if (!event) {
            return;
        }

        if (confirm('Delete this event?')) {

            event.remove();

            saveEvents();

            closeEventModal();

        }

    });


    // -----------------------------
    // Modal controls
    // -----------------------------

    closeModal.addEventListener('click', closeEventModal);

    cancelButton.addEventListener('click', closeEventModal);


    modal.addEventListener('click', function (e) {

        if (e.target === modal) {
            closeEventModal();
        }

    });


    function closeEventModal() {

        modal.classList.add('hidden');

    }


    // -----------------------------
    // Save events to localStorage
    // -----------------------------

    function saveEvents() {

        const events = calendar.getEvents().map(function (event) {

            return {

                id: event.id,

                title: event.title,

                start: event.startStr,

                end: event.endStr || null,

                allDay: event.allDay,

                extendedProps: {

                    location:
                        event.extendedProps.location || '',

                    notes:
                        event.extendedProps.notes || ''

                }

            };

        });


        localStorage.setItem(
            'myCalendarEvents',
            JSON.stringify(events)
        );

    }


    // -----------------------------
    // Helpers
    // -----------------------------

    function formatDate(date) {

        const year = date.getFullYear();

        const month = String(
            date.getMonth() + 1
        ).padStart(2, '0');

        const day = String(
            date.getDate()
        ).padStart(2, '0');

        return `${year}-${month}-${day}`;

    }


    function formatTime(date) {

        const hours = String(
            date.getHours()
        ).padStart(2, '0');

        const minutes = String(
            date.getMinutes()
        ).padStart(2, '0');

        return `${hours}:${minutes}`;

    }

});
