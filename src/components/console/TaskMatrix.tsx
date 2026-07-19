import { taskGoals } from "../../data/indexes";

export interface TaskMatrixProps {
  goals: typeof taskGoals;
  onGoal: (goal: (typeof taskGoals)[number]) => void;
}

export function TaskMatrix({ goals, onGoal }: TaskMatrixProps) {
  return (
    <section className="task-matrix task-goals" id="task-goals">
      <div className="section-heading">
        <h2>任务入口</h2>
        <p>不知道该点哪个 skill 时，从这里开始。</p>
      </div>
      <div className="task-grid">
        {goals.map((goal) => (
          <button className="task-card" key={goal.label} type="button" onClick={() => onGoal(goal)}>
            <strong>{goal.label}</strong>
            <span>{goal.hint}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
