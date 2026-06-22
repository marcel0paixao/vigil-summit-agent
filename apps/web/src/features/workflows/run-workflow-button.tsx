import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Play } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { queryKeys } from "@/shared/api/query-keys";
import { requestWorkflowExecution } from "@/shared/api/workflows";
import { Button, type ButtonProps } from "@/shared/ui/button";

const DEMO_EXECUTION_INPUT = {
  leadId: "lead_123",
  email: "lead@example.test",
  company: "Acme Automation",
  source: "web"
};

interface RunWorkflowButtonProps extends Omit<ButtonProps, "onClick"> {
  workspaceId: string;
  workflowId: string;
}

export function RunWorkflowButton({
  workspaceId,
  workflowId,
  children = "Run",
  ...props
}: RunWorkflowButtonProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      requestWorkflowExecution(workspaceId, workflowId, {
        input: DEMO_EXECUTION_INPUT
      }),
    onSuccess: async (execution) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.workflowExecutions(workspaceId, workflowId)
      });
      navigate(`/app/workspaces/${workspaceId}/workflows/${workflowId}/executions/${execution.id}`);
    }
  });
  const showLabel = props.size !== "icon";

  return (
    <Button
      {...props}
      disabled={props.disabled || mutation.isPending}
      onClick={() => mutation.mutate()}
      type="button"
    >
      {mutation.isPending ? <Loader2 className="animate-spin" /> : <Play />}
      {showLabel ? children : <span className="sr-only">Run</span>}
    </Button>
  );
}
