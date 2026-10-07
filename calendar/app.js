document.addEventListener('DOMContentLoaded', function () {

    const calendarEl = document.getElementById('calendar');

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

            const title = prompt('Event title:');

            if (!title) {
                return;
            }

            calendar.addEvent({
                title: title,
                start: info.dateStr,
                allDay: true
            });

            saveEvents();
        },

        eventClick: function (info) {

            const action = prompt(
                'Type "edit" to change the title, or "delete" to remove the event.'
            );

            if (action === 'delete') {

                if (confirm('Delete this event?')) {
                    info.event.remove();
                    saveEvents();
                }

            } else if (action === 'edit') {

                const newTitle = prompt(
                    'New event title:',
                    info.event.title
                );

                if (newTitle) {
                    info.event.setProp('title', newTitle);
                    saveEvents();
                }
            }
        },

        eventDrop: function () {
            saveEvents();
        },

        eventResize: function () {
            saveEvents();
        }
    });

    calendar.render();

    function saveEvents() {

        const events = calendar.getEvents().map(function (event) {

            return {
                id: event.id,
                title: event.title,
                start: event.startStr,
                end: event.endStr || null,
                allDay: event.allDay
            };

        });

        localStorage.setItem(
            'myCalendarEvents',
            JSON.stringify(events)
        );
    }

});
