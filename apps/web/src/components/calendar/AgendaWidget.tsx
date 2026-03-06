import { useQuery } from '@tanstack/react-query';
import { Calendar, Clock, Users, ChevronRight } from 'lucide-react';
import { api } from '../../lib/api-client';
import Card from '../ui/Card';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  participants?: string[];
  date: string;
  location?: string;
  isCalendly?: boolean;
}

interface CalendarEventsResponse {
  data: CalendarEvent[];
  source?: string;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return (
    d.getDate() === tomorrow.getDate() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getFullYear() === tomorrow.getFullYear()
  );
}

function groupEvents(events: CalendarEvent[]): { today: CalendarEvent[]; tomorrow: CalendarEvent[] } {
  const today: CalendarEvent[] = [];
  const tomorrow: CalendarEvent[] = [];

  for (const event of events) {
    const dateToCheck = event.date || event.startTime;
    if (isToday(dateToCheck)) {
      today.push(event);
    } else if (isTomorrow(dateToCheck)) {
      tomorrow.push(event);
    }
  }

  return { today, tomorrow };
}

function EventItem({ event }: { event: CalendarEvent }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 hover:bg-bg-secondary/30">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent/10">
        <Calendar size={14} className="text-accent" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text-primary">{event.title}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-text-tertiary">
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {formatTime(event.startTime)}
            {event.endTime && <> - {formatTime(event.endTime)}</>}
          </span>
          {event.participants && event.participants.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={12} />
              {event.participants.length} participant{event.participants.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AgendaWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ['calendar', 'events'],
    queryFn: () => api.get<CalendarEventsResponse>('/integrations/calendar/events'),
  });

  if (isLoading) {
    return (
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary">Agenda</h3>
        </div>
        <Skeleton className="h-16 w-full" count={3} />
      </Card>
    );
  }

  const events = data?.data ?? [];
  const { today, tomorrow } = groupEvents(events);
  const hasEvents = today.length > 0 || tomorrow.length > 0;

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-text-primary">Agenda</h3>
        <a
          href="/calendar"
          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Voir tout
          <ChevronRight size={14} />
        </a>
      </div>

      {!hasEvents ? (
        <EmptyState
          title="Aucun événement"
          description="Votre agenda est vide pour aujourd'hui et demain"
          icon={<Calendar size={40} strokeWidth={1} />}
        />
      ) : (
        <div className="space-y-4">
          {today.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Aujourd'hui
              </h4>
              <div className="space-y-2">
                {today.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}

          {tomorrow.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Demain
              </h4>
              <div className="space-y-2">
                {tomorrow.map((event) => (
                  <EventItem key={event.id} event={event} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
