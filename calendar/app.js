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


    // -----------------------------
    // Calendar
    // -----------------------------

    const calendar = new FullCalendar.Calendar(calendarEl, {

        initialView:
            localStorage.getItem('calendarView') || 'dayGridMonth',

        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay'
        },

        selectable: true,
        selectMirror: true,
        editable: true,

        events: savedEvents,


        // Remember the current calendar view
        viewDidMount: function (info) {

            localStorage.setItem(
                'calendarView',
                info.view.type
            );

        },


        // Click an individual date
        dateClick: function (info) {

            openNewEvent(info.date);

        },


        // Drag across a time range
        select: function (info) {

            openSelectedEvent(info);

            calendar.unselect();

        },


        // Click existing event
        eventClick: function (info) {

            openEditEvent(info.event);

        },


        // Event moved
        eventDrop: function () {

            saveEvents();

        },


        // Event duration changed
        eventResize: function () {

            saveEvents();

        }

    });


    calendar.render();


    // -----------------------------
    // New event button
    // -----------------------------

    newEventButton.addEventListener('click', function () {

        openNewEvent(new Date());

    });


    // -----------------------------
    // Create event from selection
    // -----------------------------

    function openSelectedEvent(info) {

        eventForm.reset();

        eventId.value = '';

        modalTitle.textContent = 'New event';

        deleteButton.classList.add('hidden');

        eventTitle.value = '';

        eventLocation.value = '';

        eventNotes.value = '';

        eventDate.value = formatDate(info.start);


        if (info.allDay) {

            allDay.checked = true;

            startTime.value = '';

            endTime.value = '';

        } else {

            allDay.checked = false;

            startTime.value = formatTime(info.start);

            if (info.end) {

                endTime.value = formatTime(info.end);

            } else {

                endTime.value = '';

            }

        }


        updateTimeFields();

        modal.classList.remove('hidden');

        eventTitle.focus();

    }


    // -----------------------------
    // Create new event
    // -----------------------------

    function openNewEvent(date) {

        eventForm.reset();

        eventId.value = '';

        eventTitle.value = '';

        eventLocation.value = '';

        eventNotes.value = '';

        modalTitle.textContent = 'New event';

        deleteButton.classList.add('hidden');

        eventDate.value = formatDate(date);

        allDay.checked = true;

        startTime.value = '';

        endTime.value = '';

        updateTimeFields();

        modal.classList.remove('hidden');

        eventTitle.focus();

    }


    // -----------------------------
    // Edit existing event
    // -----------------------------

    function openEditEvent(event) {

        eventForm.reset();

        eventId.value = event.id || '';

        eventTitle.value = event.title || '';

        eventDate.value = formatDate(event.start);

        allDay.checked = event.allDay;


        if (event.allDay) {

            startTime.value = '';

            endTime.value = '';

        } else {

            startTime.value = formatTime(event.start);

            if (event.end) {

                endTime.value = formatTime(event.end);

            } else {

                endTime.value = '';

            }

        }


        eventLocation.value =
            event.extendedProps.location || '';

        eventNotes.value =
            event.extendedProps.notes || '';


        modalTitle.textContent = 'Edit event';

        deleteButton.classList.remove('hidden');

        updateTimeFields();

        modal.classList.remove('hidden');

        eventTitle.focus();

    }


    // -----------------------------
    // All-day toggle
    // -----------------------------

    allDay.addEventListener('change', function () {

        if (allDay.checked) {

            startTime.value = '';

            endTime.value = '';

        }

        updateTimeFields();

    });


    function updateTimeFields() {

        startTime.disabled = allDay.checked;

        endTime.disabled = allDay.checked;

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

        if (!date) {
            return;
        }


        let start;
        let end = null;


        // All-day event
        if (allDay.checked) {

            start = date;

        }


        // Timed event
        else {

            if (!startTime.value) {

                alert('Please enter a start time.');

                return;

            }


            start = date + 'T' + startTime.value;


            if (endTime.value) {

                end = date + 'T' + endTime.value;


                if (endTime.value <= startTime.value) {

                    alert(
                        'End time must be later than start time.'
                    );

                    return;

                }

            }

        }


        const existingEvent = eventId.value
            ? calendar.getEventById(eventId.value)
            : null;


        // Update existing event
        if (existingEvent) {

            existingEvent.setProp(
                'title',
                title
            );

            existingEvent.setAllDay(
                allDay.checked
            );

            existingEvent.setStart(start);

            existingEvent.setEnd(end);


            existingEvent.setExtendedProp(
                'location',
                eventLocation.value.trim()
            );

            existingEvent.setExtendedProp(
                'notes',
                eventNotes.value.trim()
            );

        }


        // Create new event
        else {

            calendar.addEvent({

                id: Date.now().toString(),

                title: title,

                start: start,

                end: end,

                allDay: allDay.checked,

                extendedProps: {

                    location:
                        eventLocation.value.trim(),

                    notes:
                        eventNotes.value.trim()

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
    // Close modal
    // -----------------------------

    closeModal.addEventListener(
        'click',
        closeEventModal
    );


    cancelButton.addEventListener(
        'click',
        closeEventModal
    );


    modal.addEventListener('click', function (e) {

        if (e.target === modal) {

            closeEventModal();

        }

    });


    function closeEventModal() {

        modal.classList.add('hidden');

    }


    // -----------------------------
    // Save events
    // -----------------------------

    function saveEvents() {

        const events = calendar.getEvents().map(function (event) {

            return {

                id: event.id,

                title: event.title,

                start: event.start
                    ? event.start.toISOString()
                    : null,

                end: event.end
                    ? event.end.toISOString()
                    : null,

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
    // Date helper
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


    // -----------------------------
    // Time helper
    // -----------------------------

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
