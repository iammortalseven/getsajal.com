```javascript
document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');

    const modal = document.getElementById('eventModal');
    const modalTitle = document.getElementById('modalTitle');
    const eventForm = document.getElementById('eventForm');

    const eventId = document.getElementById('eventId');
    const eventTitle = document.getElementById('eventTitle');
    const eventCategory = document.getElementById('eventCategory');
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


    // -----------------------------
    // Category colours
    // -----------------------------

    const categoryColors = {

        personal: {
            background: '#3b82f6',
            text: '#ffffff'
        },

        work: {
            background: '#22c55e',
            text: '#ffffff'
        },

        family: {
            background: '#eab308',
            text: '#111111'
        },

        photography: {
            background: '#8b5cf6',
            text: '#ffffff'
        },

        important: {
            background: '#ef4444',
            text: '#ffffff'
        }

    };


    // -----------------------------
    // Load saved events
    // -----------------------------

    let savedEvents = [];

    try {

        savedEvents = JSON.parse(
            localStorage.getItem('myCalendarEvents') || '[]'
        );

    } catch (error) {

        savedEvents = [];

    }


    // -----------------------------
    // Apply category colours
    // -----------------------------

    savedEvents = savedEvents.map(function (event) {

        const category =
            event.extendedProps &&
            event.extendedProps.category
                ? event.extendedProps.category
                : 'personal';

        const colors =
            categoryColors[category] ||
            categoryColors.personal;

        return {

            ...event,

            backgroundColor:
                colors.background,

            borderColor:
                colors.background,

            textColor:
                colors.text,

            extendedProps: {

                ...(event.extendedProps || {}),

                category:
                    category

            }

        };

    });


    // -----------------------------
    // Calendar
    // -----------------------------

    const calendar = new FullCalendar.Calendar(
        calendarEl,
        {

            initialView:
                localStorage.getItem('calendarView') ||
                'dayGridMonth',

            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right:
                    'dayGridMonth,timeGridWeek,timeGridDay'
            },

            selectable: true,

            editable: true,

            selectMirror: true,

            events: savedEvents,


            // Remember current view
            viewDidMount: function (info) {

                localStorage.setItem(
                    'calendarView',
                    info.view.type
                );

            },


            // Click a date
            dateClick: function (info) {

                openNewEvent(
                    info.date,
                    info.allDay
                );

            },


            // Drag across calendar
            select: function (info) {

                const selection = {

                    start:
                        new Date(info.start),

                    end:
                        info.end
                            ? new Date(info.end)
                            : null,

                    allDay:
                        info.allDay

                };


                calendar.unselect();


                setTimeout(function () {

                    openSelectedEvent(
                        selection
                    );

                }, 0);

            },


            // Click existing event
            eventClick: function (info) {

                openEditEvent(
                    info.event
                );

            },


            // Drag event
            eventDrop: function () {

                saveEvents();

            },


            // Resize event
            eventResize: function () {

                saveEvents();

            }

        }
    );


    calendar.render();


    // -----------------------------
    // New event button
    // -----------------------------

    newEventButton.addEventListener(
        'click',
        function () {

            openNewEvent(
                new Date(),
                true
            );

        }
    );


    // -----------------------------
    // New event from time selection
    // -----------------------------

    function openSelectedEvent(selection) {

        eventForm.reset();

        eventId.value = '';

        modalTitle.textContent =
            'New event';

        deleteButton.classList.add(
            'hidden'
        );


        eventTitle.value = '';

        eventCategory.value =
            'personal';

        eventLocation.value = '';

        eventNotes.value = '';


        eventDate.value =
            formatDate(
                selection.start
            );


        if (selection.allDay) {

            allDay.checked = true;

            startTime.value = '';

            endTime.value = '';

        } else {

            allDay.checked = false;

            startTime.value =
                formatTime(
                    selection.start
                );


            if (selection.end) {

                endTime.value =
                    formatTime(
                        selection.end
                    );

            } else {

                endTime.value = '';

            }

        }


        updateTimeFields();


        modal.classList.remove(
            'hidden'
        );

        eventTitle.focus();

    }


    // -----------------------------
    // New event
    // -----------------------------

    function openNewEvent(date, isAllDay) {

        eventForm.reset();

        eventId.value = '';

        eventTitle.value = '';

        eventCategory.value =
            'personal';

        eventLocation.value = '';

        eventNotes.value = '';


        modalTitle.textContent =
            'New event';

        deleteButton.classList.add(
            'hidden'
        );


        eventDate.value =
            formatDate(date);


        allDay.checked =
            isAllDay !== false;


        startTime.value = '';

        endTime.value = '';


        updateTimeFields();


        modal.classList.remove(
            'hidden'
        );

        eventTitle.focus();

    }


    // -----------------------------
    // Edit event
    // -----------------------------

    function openEditEvent(event) {

        eventForm.reset();


        eventId.value =
            event.id || '';


        eventTitle.value =
            event.title || '';


        const category =
            event.extendedProps &&
            event.extendedProps.category
                ? event.extendedProps.category
                : 'personal';


        eventCategory.value =
            category;


        eventDate.value =
            formatDate(
                event.start
            );


        allDay.checked =
            event.allDay;


        if (event.allDay) {

            startTime.value = '';

            endTime.value = '';

        } else {

            startTime.value =
                formatTime(
                    event.start
                );


            if (event.end) {

                endTime.value =
                    formatTime(
                        event.end
                    );

            } else {

                endTime.value = '';

            }

        }


        eventLocation.value =
            event.extendedProps.location || '';


        eventNotes.value =
            event.extendedProps.notes || '';


        modalTitle.textContent =
            'Edit event';


        deleteButton.classList.remove(
            'hidden'
        );


        updateTimeFields();


        modal.classList.remove(
            'hidden'
        );


        eventTitle.focus();

    }


    // -----------------------------
    // Category change
    // -----------------------------

    eventCategory.addEventListener(
        'change',
        function () {

            // Nothing needs to happen here.
            // The colour is applied when the
            // event is saved.

        }
    );


    // -----------------------------
    // All-day toggle
    // -----------------------------

    allDay.addEventListener(
        'change',
        function () {

            if (allDay.checked) {

                startTime.value = '';

                endTime.value = '';

            }

            updateTimeFields();

        }
    );


    function updateTimeFields() {

        startTime.disabled =
            allDay.checked;

        endTime.disabled =
            allDay.checked;

    }


    // -----------------------------
    // Save event
    // -----------------------------

    eventForm.addEventListener(
        'submit',
        function (e) {

            e.preventDefault();


            const title =
                eventTitle.value.trim();


            if (!title) {

                return;

            }


            const date =
                eventDate.value;


            if (!date) {

                return;

            }


            const category =
                eventCategory.value ||
                'personal';


            const colors =
                categoryColors[category] ||
                categoryColors.personal;


            let start;

            let end = null;


            // -------------------------
            // All-day
            // -------------------------

            if (allDay.checked) {

                start = date;

            }


            // -------------------------
            // Timed
            // -------------------------

            else {

                if (!startTime.value) {

                    alert(
                        'Please enter a start time.'
                    );

                    return;

                }


                start =
                    date +
                    'T' +
                    startTime.value;


                if (endTime.value) {

                    if (
                        endTime.value <=
                        startTime.value
                    ) {

                        alert(
                            'End time must be later than start time.'
                        );

                        return;

                    }


                    end =
                        date +
                        'T' +
                        endTime.value;

                }

            }


            const existingEvent =
                eventId.value
                    ? calendar.getEventById(
                        eventId.value
                    )
                    : null;


            // -------------------------
            // Update existing event
            // -------------------------

            if (existingEvent) {

                existingEvent.setProp(
                    'title',
                    title
                );


                existingEvent.setAllDay(
                    allDay.checked
                );


                existingEvent.setStart(
                    start
                );


                existingEvent.setEnd(
                    end
                );


                existingEvent.setProp(
                    'backgroundColor',
                    colors.background
                );


                existingEvent.setProp(
                    'borderColor',
                    colors.background
                );


                existingEvent.setProp(
                    'textColor',
                    colors.text
                );


                existingEvent.setExtendedProp(
                    'category',
                    category
                );


                existingEvent.setExtendedProp(
                    'location',
                    eventLocation.value.trim()
                );


                existingEvent.setExtendedProp(
                    'notes',
                    eventNotes.value.trim()
                );

            }


            // -------------------------
            // Create new event
            // -------------------------

            else {

                calendar.addEvent({

                    id:
                        Date.now().toString(),

                    title:
                        title,

                    start:
                        start,

                    end:
                        end,

                    allDay:
                        allDay.checked,

                    backgroundColor:
                        colors.background,

                    borderColor:
                        colors.background,

                    textColor:
                        colors.text,

                    extendedProps: {

                        category:
                            category,

                        location:
                            eventLocation.value.trim(),

                        notes:
                            eventNotes.value.trim()

                    }

                });

            }


            saveEvents();

            closeEventModal();

        }
    );


    // -----------------------------
    // Delete
    // -----------------------------

    deleteButton.addEventListener(
        'click',
        function () {

            const id =
                eventId.value;


            if (!id) {

                return;

            }


            const event =
                calendar.getEventById(id);


            if (!event) {

                return;

            }


            if (
                confirm(
                    'Delete this event?'
                )
            ) {

                event.remove();

                saveEvents();

                closeEventModal();

            }

        }
    );


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


    modal.addEventListener(
        'click',
        function (e) {

            if (e.target === modal) {

                closeEventModal();

            }

        }
    );


    function closeEventModal() {

        modal.classList.add(
            'hidden'
        );

    }


    // -----------------------------
    // Save events
    // -----------------------------

    function saveEvents() {

        const events =
            calendar.getEvents()
                .map(function (event) {

                    return {

                        id:
                            event.id,

                        title:
                            event.title,

                        start:
                            event.start
                                ? event.start.toISOString()
                                : null,

                        end:
                            event.end
                                ? event.end.toISOString()
                                : null,

                        allDay:
                            event.allDay,

                        backgroundColor:
                            event.backgroundColor,

                        borderColor:
                            event.borderColor,

                        textColor:
                            event.textColor,

                        extendedProps: {

                            category:
                                event.extendedProps.category ||
                                'personal',

                            location:
                                event.extendedProps.location ||
                                '',

                            notes:
                                event.extendedProps.notes ||
                                ''

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

        const year =
            date.getFullYear();


        const month =
            String(
                date.getMonth() + 1
            ).padStart(2, '0');


        const day =
            String(
                date.getDate()
            ).padStart(2, '0');


        return (
            year +
            '-' +
            month +
            '-' +
            day
        );

    }


    function formatTime(date) {

        const hours =
            String(
                date.getHours()
            ).padStart(2, '0');


        const minutes =
            String(
                date.getMinutes()
            ).padStart(2, '0');


        return (
            hours +
            ':' +
            minutes
        );

    }

});
```
