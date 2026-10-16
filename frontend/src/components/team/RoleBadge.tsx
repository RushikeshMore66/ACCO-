import { UserRole } from "@/types/auth";
import { Badge } from "@/components/ui/Badge";
import { Crown, Briefcase, PhoneCall, Eye } from "lucide-react";

interface RoleBadgeProps {
  role: UserRole;
  showIcon?: boolean;
}

export function RoleBadge({ role, showIcon = true }: RoleBadgeProps) {
  switch (role) {
    case "OWNER":
      return (
        <Badge variant="purple" className="font-medium gap-1">
          {showIcon && <Crown size={12} className="shrink-0" />}
          <span>Owner</span>
        </Badge>
      );
    case "ADMIN":
      return (
        <Badge variant="purple" className="font-medium gap-1">
          {showIcon && <Crown size={12} className="shrink-0" />}
          <span>Admin</span>
        </Badge>
      );
    case "FINANCE_MANAGER":
      return (
        <Badge variant="info" className="font-medium gap-1">
          {showIcon && <Briefcase size={12} className="shrink-0" />}
          <span>Finance Manager</span>
        </Badge>
      );
    case "COLLECTOR":
      return (
        <Badge variant="success" className="font-medium gap-1">
          {showIcon && <PhoneCall size={12} className="shrink-0" />}
          <span>Collector</span>
        </Badge>
      );
    case "VIEWER":
      return (
        <Badge variant="muted" className="font-medium gap-1">
          {showIcon && <Eye size={12} className="shrink-0" />}
          <span>Viewer</span>
        </Badge>
      );
    default:
      return (
        <Badge variant="default" className="font-medium">
          {role}
        </Badge>
      );
  }
}
