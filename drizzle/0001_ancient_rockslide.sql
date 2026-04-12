CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` int NOT NULL,
	`siteId` int NOT NULL,
	`clockInTime` timestamp NOT NULL,
	`clockOutTime` timestamp,
	`companionEmployeeIds` text,
	`workReport` text,
	`workingMinutes` int,
	`status` enum('active','deleted') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `correction_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`attendanceRecordId` int NOT NULL,
	`employeeId` int NOT NULL,
	`reason` text NOT NULL,
	`correctionType` enum('clock_in','clock_out','cancel') NOT NULL,
	`newClockInTime` timestamp,
	`newClockOutTime` timestamp,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approvedBy` int,
	`approvedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `correction_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `employee_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`employeeId` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `employee_master_id` PRIMARY KEY(`id`),
	CONSTRAINT `employee_master_employeeId_unique` UNIQUE(`employeeId`)
);
--> statement-breakpoint
CREATE TABLE `site_master` (
	`id` int AUTO_INCREMENT NOT NULL,
	`siteId` varchar(50) NOT NULL,
	`siteName` varchar(255) NOT NULL,
	`location` varchar(255),
	`status` enum('active','inactive') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_master_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_master_siteId_unique` UNIQUE(`siteId`)
);
--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_employeeId_employee_master_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employee_master`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD CONSTRAINT `attendance_records_siteId_site_master_id_fk` FOREIGN KEY (`siteId`) REFERENCES `site_master`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `correction_requests` ADD CONSTRAINT `correction_requests_attendanceRecordId_attendance_records_id_fk` FOREIGN KEY (`attendanceRecordId`) REFERENCES `attendance_records`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `correction_requests` ADD CONSTRAINT `correction_requests_employeeId_employee_master_id_fk` FOREIGN KEY (`employeeId`) REFERENCES `employee_master`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `correction_requests` ADD CONSTRAINT `correction_requests_approvedBy_employee_master_id_fk` FOREIGN KEY (`approvedBy`) REFERENCES `employee_master`(`id`) ON DELETE no action ON UPDATE no action;